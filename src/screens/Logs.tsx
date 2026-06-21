import { useStore } from '@/store/store';

export default function Logs() {
  const { logs } = useStore();
  return (
    <div className="content">
      <h2 className="h1">Logs & Diagnostics</h2>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <span style={{ color: 'var(--dim)', fontSize: 12 }}>sing-box stderr + connection events ({logs.length})</span>
          <button className="btn" onClick={() => useStore.setState({ logs: [] })}>Clear</button>
        </div>
        <div className="log" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {logs.length ? logs.join('\n') : 'No logs yet. Connect to see sing-box output.'}
        </div>
      </div>
    </div>
  );
}
