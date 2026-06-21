import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';
import {
  type AppSettings, type ConnectionMode, type ConnState, type Group, type Profile,
  type TrafficSample, DEFAULT_SETTINGS, MANUAL_GROUP_ID,
} from '@/types';
import { importText, type ImportSourceKind } from '@/lib/import';
import { dedupe } from '@/lib/import/util';
import { connect as engineConnect, disconnect as engineDisconnect, tcpPing, isElevated, relaunchElevated, exitApp } from '@/lib/engine';
import type { ClashClient } from '@/lib/clash/client';

interface State {
  groups: Group[];
  profiles: Profile[];
  settings: AppSettings;

  // runtime (not persisted)
  conn: ConnState;
  activeProfileId: string | null;
  activeGroupId: string;
  traffic: TrafficSample;
  totalUp: number; totalDown: number;
  connectedAt: number | null;
  logs: string[];
  killSwitchEngaged: boolean;

  // actions
  importFrom: (text: string, groupId: string, kind?: ImportSourceKind) => { added: number; issues: number };
  addSubscription: (name: string, url: string) => Promise<void>;
  refreshSubscription: (groupId: string) => Promise<void>;
  renameProfile: (id: string, name: string) => void;
  updateProfile: (id: string, name: string, configPatch: Partial<import('@/types').ProfileConfig>) => void;
  removeProfile: (id: string) => void;
  setActiveGroup: (id: string) => void;
  connect: (profileId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  testAll: (groupId: string) => Promise<void>;
  testTcp: (id: string) => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => void;
  pushLog: (l: string) => void;
}

let client: ClashClient | null = null;
let disposers: Array<() => void> = [];
// Guards the elevation relaunch so rapid repeated clicks can't fire multiple
// UAC prompts / spawn multiple instances.
let elevating = false;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      groups: [{ id: MANUAL_GROUP_ID, name: 'Manual', kind: 'manual', createdAt: Date.now() }],
      profiles: [],
      settings: DEFAULT_SETTINGS,

      conn: 'disconnected',
      activeProfileId: null,
      activeGroupId: MANUAL_GROUP_ID,
      traffic: { up: 0, down: 0, ts: 0 },
      totalUp: 0, totalDown: 0,
      connectedAt: null,
      logs: [],
      killSwitchEngaged: false,

      importFrom: (text, groupId, kind) => {
        const res = importText(text, groupId, kind);
        const fresh = dedupe(get().profiles, res.profiles);
        set({ profiles: [...get().profiles, ...fresh] });
        return { added: fresh.length, issues: res.issues.length };
      },

      addSubscription: async (name, url) => {
        const id = `sub-${Date.now().toString(36)}`;
        const group: Group = { id, name, kind: 'subscription', url, autoUpdateMinutes: get().settings.subAutoUpdateMinutes, createdAt: Date.now() };
        set({ groups: [...get().groups, group] });
        await get().refreshSubscription(id);
      },

      refreshSubscription: async (groupId) => {
        const g = get().groups.find((x) => x.id === groupId);
        if (!g?.url) return;
        // Use Tauri http to avoid webview CORS on the subscription host.
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        const r = await tauriFetch(g.url, { method: 'GET' });
        const text = await r.text();
        const res = importText(text, groupId);
        // Drop stale members of this group, then re-add (dedupe keeps identity).
        const others = get().profiles.filter((p) => p.groupId !== groupId);
        const merged = dedupe(others, res.profiles);
        set({
          profiles: [...others, ...merged],
          groups: get().groups.map((x) => x.id === groupId ? { ...x, lastUpdatedAt: Date.now() } : x),
        });
        get().pushLog(`Subscription "${g.name}" refreshed: ${merged.length} profiles, ${res.issues.length} issues`);
      },

      renameProfile: (id, name) => set({ profiles: get().profiles.map((p) => p.id === id ? { ...p, name } : p) }),
      updateProfile: (id, name, configPatch) => set({
        profiles: get().profiles.map((p) => p.id === id
          ? { ...p, name: name || p.name, config: { ...p.config, ...configPatch } }
          : p),
      }),
      removeProfile: (id) => set({ profiles: get().profiles.filter((p) => p.id !== id) }),
      setActiveGroup: (id) => set({ activeGroupId: id }),

      connect: async (profileId) => {
        const { profiles, activeGroupId, settings, conn } = get();
        // Re-entry guard: ignore repeated clicks while a connect/elevation is
        // already in flight (prevents multiple UAC prompts / launches).
        if (conn === 'connecting' || elevating) return;
        // Build the candidate set from the SELECTED profile's own group so the
        // chosen node is always present as an outbound (not just the active tab).
        const prof = profiles.find((p) => p.id === profileId);
        const groupId = prof?.groupId ?? activeGroupId;
        const groupProfiles = profiles.filter((p) => p.groupId === groupId);
        const mode: ConnectionMode = settings.defaultMode;

        set({ conn: 'connecting', killSwitchEngaged: false });

        if (mode === 'tun' && !(await isElevated())) {
          elevating = true;
          get().pushLog('TUN mode requires elevation — requesting admin (UAC)…');
          const ok = await relaunchElevated().catch(() => false);
          if (ok) {
            // The elevated instance takes over; quit this one so there is only
            // a single window and no repeat prompts.
            await exitApp().catch(() => {});
            return;
          }
          elevating = false;
          get().pushLog('Elevation declined — switch Settings → mode to "System proxy" to connect without admin.');
          set({ conn: 'disconnected' });
          return;
        }

        try {
          const result = await engineConnect(groupProfiles, profileId, settings, mode);
          client = result.client;
          // Honest health check: does the selected server actually respond
          // THROUGH the proxy? (Engine being up != tunnel works.)
          get().pushLog('Engine up — testing the selected server through the proxy…');
          const ms = await result.client.testDelay(profileId, undefined, 6000).catch(() => -1);
          if (ms < 0) {
            get().pushLog('Server did NOT respond through the proxy. If this is a TLS profile with SNI camouflage (e.g. sni=aka.ms), turn ON Settings → "Allow insecure TLS" and reconnect. Otherwise check the server is up and the params (flow/SNI/port) are correct.');
            await engineDisconnect().catch(() => {});
            client = null;
            set({ conn: 'error', profiles: get().profiles.map((p) => p.id === profileId ? { ...p, lastLatencyMs: -1 } : p) });
            return;
          }
          // Push-based live stats (Step 6: no polling).
          disposers.push(result.client.subscribeTraffic((t) => {
            const cur = get();
            set({ traffic: { up: t.up, down: t.down, ts: Date.now() }, totalUp: cur.totalUp + t.up, totalDown: cur.totalDown + t.down });
          }));
          set({ conn: 'connected', activeProfileId: profileId, connectedAt: Date.now() });
          set({ profiles: get().profiles.map((p) => p.id === profileId ? { ...p, lastConnectedAt: Date.now(), lastLatencyMs: ms } : p) });
          get().pushLog(`Connected · ${ms} ms through the selected server`);
        } catch (e) {
          get().pushLog(`Connect failed: ${(e as Error).message}`);
          set({ conn: 'error' });
        }
      },

      disconnect: async () => {
        elevating = false;
        disposers.forEach((d) => d()); disposers = []; client = null;
        await engineDisconnect().catch(() => {});
        set({ conn: 'disconnected', activeProfileId: null, connectedAt: null, traffic: { up: 0, down: 0, ts: 0 } });
      },

      testAll: async (groupId) => {
        // URL-test through the engine if connected; otherwise TCP ping as a quick
        // reachability check (Step 3 two-tier).
        const targets = get().profiles.filter((p) => p.groupId === groupId);
        if (client && get().conn === 'connected') {
          await client.testAll(targets.map((p) => p.id), (node, ms) => {
            set({ profiles: get().profiles.map((p) => p.id === node ? { ...p, lastLatencyMs: ms } : p) });
          });
        } else {
          await Promise.all(targets.map(async (p) => {
            const ms = await tcpPing(p.config.server, p.config.port).catch(() => -1);
            set({ profiles: get().profiles.map((x) => x.id === p.id ? { ...x, lastTcpMs: ms } : x) });
          }));
        }
      },

      testTcp: async (id) => {
        const p = get().profiles.find((x) => x.id === id); if (!p) return;
        const ms = await tcpPing(p.config.server, p.config.port).catch(() => -1);
        set({ profiles: get().profiles.map((x) => x.id === id ? { ...x, lastTcpMs: ms } : x) });
      },

      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      pushLog: (l) => set({ logs: [...get().logs.slice(-499), `${new Date().toLocaleTimeString()}  ${l}`] }),
    }),
    {
      name: 'netch-client',
      partialize: (s) => ({ groups: s.groups, profiles: s.profiles, settings: s.settings, activeGroupId: s.activeGroupId }),
    },
  ),
);

// ── Wire Tauri events into the store once ────────────────────────────────────
export async function initEvents() {
  await listen<{ line: string }>('singbox-log', (e) => useStore.getState().pushLog(e.payload.line));
  await listen('singbox-exit', () => {
    if (useStore.getState().conn === 'connected') useStore.getState().pushLog('sing-box exited unexpectedly');
  });
  await listen('kill-switch-engaged', () => useStore.setState({ killSwitchEngaged: true, conn: 'error' }));
  await listen('tray-connect', () => { const s = useStore.getState(); if (s.activeProfileId || s.profiles[0]) s.connect(s.activeProfileId || s.profiles[0].id); });
  await listen('tray-disconnect', () => useStore.getState().disconnect());
}
