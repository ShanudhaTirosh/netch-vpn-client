import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useEffect } from 'react';
import { useStore } from '@/store/store';
import type { ConnectionMode } from '@/types';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <div className={`switch ${on ? 'on' : ''}`} onClick={onClick}><i /></div>;
}

export default function Settings() {
  const { settings, setSettings } = useStore();

  useEffect(() => { isEnabled().then((v) => { if (v !== settings.autoStartOnBoot) setSettings({ autoStartOnBoot: v }); }).catch(() => {}); }, []);

  const toggleAutostart = async () => {
    const next = !settings.autoStartOnBoot;
    try { next ? await enable() : await disable(); setSettings({ autoStartOnBoot: next }); } catch { /* ignore */ }
  };

  return (
    <div className="content">
      <h2 className="h1">Settings</h2>

      <div className="card">
        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>Default connection mode</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>TUN captures all system traffic (needs admin). System proxy is the fallback.</div></div>
          <select className="in" style={{ width: 180 }} value={settings.defaultMode} onChange={(e) => setSettings({ defaultMode: e.target.value as ConnectionMode })}>
            <option value="tun">TUN (system-wide)</option>
            <option value="system">System proxy</option>
          </select>
        </div>

        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>Kill switch</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Block all traffic if sing-box crashes while connected (fail closed).</div></div>
          <Toggle on={settings.killSwitch} onClick={() => setSettings({ killSwitch: !settings.killSwitch })} />
        </div>

        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>Auto-start on boot</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Launch Netch VPN to the tray at login.</div></div>
          <Toggle on={settings.autoStartOnBoot} onClick={toggleAutostart} />
        </div>

        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>Allow insecure TLS</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Skip certificate verification. Required for SNI-camouflage profiles (e.g. sni=aka.ms while the cert is your real domain) — turn this ON if a TLS profile won't connect.</div></div>
          <Toggle on={settings.allowInsecureTls} onClick={() => setSettings({ allowInsecureTls: !settings.allowInsecureTls })} />
        </div>

        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>Multiplex (mux)</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Only enable if your server's inbound has mux on (see ASSUMPTIONS). Off by default.</div></div>
          <Toggle on={settings.enableMux} onClick={() => setSettings({ enableMux: !settings.enableMux })} />
        </div>

        <div className="row between" style={{ marginBottom: 16 }}>
          <div><div style={{ fontWeight: 600 }}>TCP Fast Open</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Faster connection setup where supported end-to-end.</div></div>
          <Toggle on={settings.enableTcpFastOpen} onClick={() => setSettings({ enableTcpFastOpen: !settings.enableTcpFastOpen })} />
        </div>

        <div className="row between">
          <div><div style={{ fontWeight: 600 }}>Subscription auto-update</div><div style={{ color: 'var(--dim)', fontSize: 12 }}>Minutes between refreshes (0 = off).</div></div>
          <input className="in" style={{ width: 100 }} type="number" min={0} value={settings.subAutoUpdateMinutes} onChange={(e) => setSettings({ subAutoUpdateMinutes: Number(e.target.value) })} />
        </div>
      </div>

      <div className="card" style={{ color: 'var(--dim)', fontSize: 12 }}>
        TUN stack: <b style={{ color: 'var(--mid)' }}>{settings.tunStack}</b> · Clash API: <b style={{ color: 'var(--mid)' }}>127.0.0.1:{settings.clashApiPort}</b>
      </div>
    </div>
  );
}
