// Shared helpers for the import pipeline.

/** UTF-8-safe base64 decode that tolerates url-safe alphabet and missing padding. */
export function b64decode(input: string): string {
  let s = input.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  try {
    // atob → binary string → decode as UTF-8
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** Heuristic: does this string look like a base64-encoded subscription blob? */
export function looksLikeBase64Sub(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t)) return false;                 // subs are one continuous token
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false; // it's a URL/share link
  if (t.length < 24) return false;
  if (!/^[A-Za-z0-9+/_=-]+$/.test(t)) return false;
  // Decoding should yield at least one share link.
  const decoded = b64decode(t);
  return /(?:vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic):\/\//.test(decoded);
}

/** Stable profile id from the connection identity, so the same server imported
    twice (e.g. overlapping subscription refreshes) dedupes to one entry. */
export function profileId(server: string, port: number, secret: string): string {
  const key = `${server.toLowerCase()}:${port}:${secret}`;
  // FNV-1a 32-bit — deterministic, no crypto dependency needed for an id.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Split pasted text into candidate links, ignoring blanks/comments. */
export function splitLines(text: string): { line: number; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ line: i + 1, text: t.trim() }))
    .filter((x) => x.text.length > 0 && !x.text.startsWith('#') && !x.text.startsWith('//'));
}

export function safeDecodeURIComponent(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

import type { Profile } from '@/types';

/** Dedupe by profile id, keeping the first occurrence (existing wins over a
    refresh import so user edits like renamed display names survive). */
export function dedupe(existing: Profile[], incoming: Profile[]): Profile[] {
  const seen = new Set(existing.map((p) => p.id));
  const out: Profile[] = [];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}
