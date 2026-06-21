export function fmtBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function fmtSpeed(bps: number): string { return `${fmtBytes(bps)}/s`; }

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
}

export function latencyClass(ms?: number): 'fast' | 'mid' | 'slow' | 'dead' {
  if (ms == null || ms < 0) return 'dead';
  if (ms < 150) return 'fast';
  if (ms < 350) return 'mid';
  return 'slow';
}
export function latencyText(ms?: number): string {
  if (ms == null) return '—';
  if (ms < 0) return 'timeout';
  return `${ms} ms`;
}
