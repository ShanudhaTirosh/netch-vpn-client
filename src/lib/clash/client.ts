// Clash-API client — drives sing-box's built-in controller. We never reimplement
// proxy switching / stats; we read and command the engine. Stats are PUSH-based
// over WebSocket (Step 6: avoids idle polling CPU).

export interface ProxyNode {
  name: string;
  type: string;
  now?: string;          // active member (for selector/urltest)
  all?: string[];        // members
  udp?: boolean;
  history?: { time: string; delay: number }[];
}

export interface TrafficEvent { up: number; down: number; }
export interface LogEvent { type: string; payload: string; }

export class ClashClient {
  private base: string;
  private wsBase: string;
  private secret: string;

  constructor(port: number, secret: string, host = '127.0.0.1') {
    this.base = `http://${host}:${port}`;
    this.wsBase = `ws://${host}:${port}`;
    this.secret = secret;
  }

  private headers(): HeadersInit {
    return this.secret ? { Authorization: `Bearer ${this.secret}` } : {};
  }

  private tokenQuery(): string {
    return this.secret ? `?token=${encodeURIComponent(this.secret)}` : '';
  }

  async getProxies(): Promise<Record<string, ProxyNode>> {
    const r = await fetch(`${this.base}/proxies`, { headers: this.headers() });
    if (!r.ok) throw new Error(`/proxies ${r.status}`);
    return (await r.json()).proxies as Record<string, ProxyNode>;
  }

  /** Switch the active member of a selector (e.g. selector "proxy" → a node tag). */
  async selectProxy(selector: string, member: string): Promise<void> {
    const r = await fetch(`${this.base}/proxies/${encodeURIComponent(selector)}`, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: member }),
    });
    if (!r.ok) throw new Error(`select ${member} → ${r.status}`);
  }

  /** Real/proxy delay (URL test) through a specific proxy node — TLS handshake
      included. This is the primary latency number shown per profile (Step 3). */
  async testDelay(node: string, url = 'https://www.gstatic.com/generate_204', timeoutMs = 5000): Promise<number> {
    const q = `url=${encodeURIComponent(url)}&timeout=${timeoutMs}`;
    const sep = this.tokenQuery() ? '&' : '?';
    const r = await fetch(`${this.base}/proxies/${encodeURIComponent(node)}/delay${this.tokenQuery()}${sep}${q}`, {
      headers: this.headers(),
    });
    if (!r.ok) return -1;                  // unreachable
    const j = await r.json();
    return typeof j.delay === 'number' ? j.delay : -1;
  }

  /** Batch URL-test, bounded concurrency so we don't hammer the server (Step 3). */
  async testAll(nodes: string[], onResult: (node: string, ms: number) => void, concurrency = 5, url?: string): Promise<void> {
    const queue = [...nodes];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const n = queue.shift()!;
        const ms = await this.testDelay(n, url).catch(() => -1);
        onResult(n, ms);
      }
    });
    await Promise.all(workers);
  }

  // ── Push-based streams ─────────────────────────────────────────────────────

  /** Live up/down bytes-per-second. Returns a disposer. */
  subscribeTraffic(onSample: (t: TrafficEvent) => void): () => void {
    const ws = new WebSocket(`${this.wsBase}/traffic${this.tokenQuery()}`);
    ws.onmessage = (e) => { try { onSample(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => ws.close();
  }

  subscribeLogs(onLog: (l: LogEvent) => void, level = 'info'): () => void {
    const sep = this.tokenQuery() ? '&' : '?';
    const ws = new WebSocket(`${this.wsBase}/logs${this.tokenQuery()}${sep}level=${level}`);
    ws.onmessage = (e) => { try { onLog(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => ws.close();
  }

  subscribeConnections(onConns: (c: any) => void): () => void {
    const ws = new WebSocket(`${this.wsBase}/connections${this.tokenQuery()}`);
    ws.onmessage = (e) => { try { onConns(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => ws.close();
  }

  /** Cheap liveness probe used while waiting for the sidecar to come up. */
  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${this.base}/version`, { headers: this.headers() });
      return r.ok;
    } catch { return false; }
  }
}
