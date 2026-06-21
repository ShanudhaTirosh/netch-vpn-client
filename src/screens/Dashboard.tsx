import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import { fmtSpeed, fmtBytes, fmtDuration } from '@/lib/format';

export default function Dashboard() {
  const { conn, activeProfileId, profiles, traffic, totalUp, totalDown, connectedAt, connect, disconnect, settings, killSwitchEngaged } = useStore();
  const active = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const [dur, setDur] = useState('00:00:00');

  useEffect(() => {
    if (conn !== 'connected' || !connectedAt) { setDur('00:00:00'); return; }
    const t = setInterval(() => setDur(fmtDuration(Date.now() - connectedAt)), 1000);
    return () => clearInterval(t);
  }, [conn, connectedAt]);

  const onClick = () => {
    if (conn === 'connected' || conn === 'connecting') disconnect();
    else if (active) connect(active.id);
  };

  const label = conn === 'connected' ? 'Disconnect' : conn === 'connecting' ? 'Connecting…' : 'Connect';

  return (
    <div className="content">
      <h2 className="h1">Dashboard</h2>

      {killSwitchEngaged && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          🔒 Kill switch engaged — sing-box exited unexpectedly and outbound traffic is blocked.
          Reconnect to restore connectivity.
        </div>
      )}

      <div className="card" style={{ display: 'grid', placeItems: 'center', gap: 18, paddingTop: 32, paddingBottom: 32 }}>
        <button className={`connect-btn ${conn === 'connected' ? 'connected' : ''} ${conn === 'connecting' ? 'connecting' : ''}`} onClick={onClick} disabled={!active}>
          {label}
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>{active ? active.name : 'No profile selected'}</div>
          <div style={{ color: 'var(--dim)', fontSize: 12 }}>
            {active ? `${active.config.protocol.toUpperCase()} · ${active.config.security} · ${active.config.server}:${active.config.port}` : 'Import a config to begin'}
            {'  ·  '}mode: {settings.defaultMode === 'tun' ? 'TUN (system-wide)' : 'System proxy'}
          </div>
        </div>
      </div>

      <div className="card stat-grid">
        <div className="stat"><div className="v" style={{ color: 'var(--netch-accent-hi)' }}>↓ {fmtSpeed(traffic.down)}</div><div className="l">Download</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--ok)' }}>↑ {fmtSpeed(traffic.up)}</div><div className="l">Upload</div></div>
        <div className="stat"><div className="v">{dur}</div><div className="l">Duration</div></div>
        <div className="stat"><div className="v">{fmtBytes(totalDown)}</div><div className="l">Session ↓</div></div>
        <div className="stat"><div className="v">{fmtBytes(totalUp)}</div><div className="l">Session ↑</div></div>
      </div>
    </div>
  );
}
