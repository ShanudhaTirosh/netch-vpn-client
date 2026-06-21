// High-level connection engine: builds the sing-box config, starts the sidecar
// via Tauri, waits for the Clash API, and returns a ClashClient for the UI to
// drive stats/switching. Disconnect tears the sidecar down cleanly.

import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, ConnectionMode, Profile } from '@/types';
import { buildSingboxConfig } from '@/lib/singbox/config';
import { ClashClient } from '@/lib/clash/client';

function randomSecret(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Connection {
  client: ClashClient;
  secret: string;
  mode: ConnectionMode;
}

async function waitForApi(client: ClashClient, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await client.ping()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('sing-box Clash API did not come up in time');
}

export async function connect(
  profiles: Profile[],
  selectedId: string,
  settings: AppSettings,
  mode: ConnectionMode,
): Promise<Connection> {
  const secret = randomSecret();
  const config = buildSingboxConfig({ profiles, selectedId, settings, mode });
  // Inject the per-launch Clash API secret (never persisted).
  config.experimental.clash_api.secret = secret;

  // TUN needs elevation; the store checks is_elevated() before calling connect
  // in TUN mode and triggers relaunch_elevated() if needed (Step 7).
  await invoke('singbox_start', {
    configJson: JSON.stringify(config, null, 2),
    tunMode: mode === 'tun',
    killSwitch: settings.killSwitch,
  });

  const client = new ClashClient(settings.clashApiPort, secret);
  await waitForApi(client);
  // Honour the user's explicit selection (the config default may be "auto").
  if (selectedId) await client.selectProxy('proxy', selectedId).catch(() => {});
  return { client, secret, mode };
}

export async function disconnect(): Promise<void> {
  await invoke('singbox_stop');
}

export async function tcpPing(host: string, port: number, timeoutMs = 3000): Promise<number> {
  return (await invoke<number>('tcp_ping', { host, port, timeoutMs })) as number;
}

export async function isElevated(): Promise<boolean> {
  return invoke<boolean>('is_elevated');
}

export async function relaunchElevated(): Promise<boolean> {
  return invoke<boolean>('relaunch_elevated');
}
