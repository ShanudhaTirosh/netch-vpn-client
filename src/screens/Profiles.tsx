import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { latencyClass, latencyText } from '@/lib/format';
import type { Profile } from '@/types';
import ProfileEditModal from './ProfileEditModal';

export default function Profiles() {
  const { groups, profiles, activeGroupId, activeProfileId, conn, setActiveGroup, connect, testAll, testTcp, removeProfile, refreshSubscription } = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);

  const list = useMemo(() => {
    const inGroup = profiles.filter((p) => p.groupId === activeGroupId);
    const filtered = q ? inGroup.filter((p) => (p.name + p.config.server).toLowerCase().includes(q.toLowerCase())) : inGroup;
    return [...filtered].sort((a, b) => {
      const la = a.lastLatencyMs ?? a.lastTcpMs ?? 99999, lb = b.lastLatencyMs ?? b.lastTcpMs ?? 99999;
      return (la < 0 ? 99998 : la) - (lb < 0 ? 99998 : lb); // fastest first, timeouts last
    });
  }, [profiles, activeGroupId, q]);

  const group = groups.find((g) => g.id === activeGroupId);

  return (
    <div className="content">
      <h2 className="h1">Profiles</h2>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {groups.map((g) => (
              <button key={g.id} className={`btn ${g.id === activeGroupId ? 'primary' : ''}`} onClick={() => setActiveGroup(g.id)}>
                {g.name} <span style={{ opacity: .6 }}>({profiles.filter((p) => p.groupId === g.id).length})</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="in" style={{ width: 180 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={() => testAll(activeGroupId)}>Test all</button>
            {group?.kind === 'subscription' && <button className="btn" onClick={() => refreshSubscription(activeGroupId)}>Refresh</button>}
          </div>
        </div>

        {list.length === 0 && <div style={{ color: 'var(--dim)', textAlign: 'center', padding: 24 }}>No profiles in this group. Use Import.</div>}

        {list.map((p) => {
          const ms = p.lastLatencyMs ?? p.lastTcpMs;
          return (
            <div key={p.id} className={`profile ${p.id === activeProfileId ? 'active' : ''}`}>
              <span className={`badge ${latencyClass(ms)}`}>{latencyText(ms)}</span>
              <div className="meta">
                <div className="name">{p.name} <span className="tag">{p.config.protocol}</span> <span className="tag">{p.config.security}</span></div>
                <div className="sub">{p.config.server}:{p.config.port} · {p.config.transport}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn" title="TCP ping" onClick={() => testTcp(p.id)}>ping</button>
                <button className="btn" title="Edit" onClick={() => setEditing(p)}>✎</button>
                <button className="btn primary" disabled={conn === 'connecting'} onClick={() => connect(p.id)}>Connect</button>
                <button className="btn" onClick={() => { if (confirm(`Remove ${p.name}?`)) removeProfile(p.id); }}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && <ProfileEditModal profile={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
