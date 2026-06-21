import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import Dashboard from '@/screens/Dashboard';
import Profiles from '@/screens/Profiles';
import Import from '@/screens/Import';
import Logs from '@/screens/Logs';
import Settings from '@/screens/Settings';

type Tab = 'dashboard' | 'profiles' | 'import' | 'logs' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊙' },
  { id: 'profiles', label: 'Profiles', icon: '☰' },
  { id: 'import', label: 'Import', icon: '⊕' },
  { id: 'logs', label: 'Logs', icon: '≡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { conn, killSwitchEngaged, groups, settings, refreshSubscription } = useStore();

  // Subscription auto-update loop (Step 1 — configurable interval).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const g of groups) {
        if (g.kind !== 'subscription' || !g.url) continue;
        const every = (g.autoUpdateMinutes ?? settings.subAutoUpdateMinutes) * 60_000;
        if (every > 0 && (!g.lastUpdatedAt || now - g.lastUpdatedAt >= every)) {
          refreshSubscription(g.id).catch(() => {});
        }
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [groups, settings.subAutoUpdateMinutes]);

  const dotClass = killSwitchEngaged || conn === 'error' ? 'err' : conn === 'connected' ? 'on' : '';
  const statusText = killSwitchEngaged ? 'Kill switch' : conn === 'connected' ? 'Connected' : conn === 'connecting' ? 'Connecting' : 'Disconnected';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="logo">N</div><b>Netch VPN</b></div>
        {TABS.map((t) => (
          <div key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span style={{ width: 18, textAlign: 'center' }}>{t.icon}</span>{t.label}
          </div>
        ))}
        <div className="spacer" />
        <div className="status-pill"><span className={`dot ${dotClass}`} />{statusText}</div>
      </aside>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'profiles' && <Profiles />}
      {tab === 'import' && <Import />}
      {tab === 'logs' && <Logs />}
      {tab === 'settings' && <Settings />}
    </div>
  );
}
