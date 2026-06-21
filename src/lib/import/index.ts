// Import pipeline: one entry point that detects what was pasted/loaded and
// dispatches to the right parser. Forgiving of messy input — trims whitespace,
// skips blank/comment lines, and reports a per-line issue rather than failing
// the whole batch.

import yaml from 'js-yaml';
import type { ImportResult, Profile, ProfileConfig, ParseIssue } from '@/types';
import { parseLink } from './links';
import { b64decode, looksLikeBase64Sub, splitLines, profileId } from './util';

export type ImportSourceKind = 'link' | 'link-list' | 'base64-sub' | 'clash-yaml' | 'singbox-json';

/** Best-effort detection of pasted/loaded text. */
export function detectKind(text: string): ImportSourceKind {
  const t = text.trim();
  if (/^[[{]/.test(t)) return 'singbox-json';
  if (/^proxies\s*:/m.test(t) || /^\s*-\s*\{?\s*name\s*:/m.test(t)) return 'clash-yaml';
  if (looksLikeBase64Sub(t)) return 'base64-sub';
  if (/\n/.test(t)) return 'link-list';
  return 'link';
}

// ── Clash / Mihomo YAML proxies → ProfileConfig ──────────────────────────────
function clashProxyToProfile(p: any, groupId: string): Profile | null {
  try {
    const type = String(p.type || '').toLowerCase();
    const base = {
      server: String(p.server),
      port: Number(p.port),
      sni: p.sni || p.servername || undefined,
      fingerprint: p['client-fingerprint'] || 'chrome',
      allowInsecure: !!p['skip-cert-verify'],
    };
    let cfg: ProfileConfig | null = null;
    if (type === 'vless') {
      const net = String(p.network || 'tcp');
      cfg = {
        protocol: 'vless', transport: net as any,
        security: p['reality-opts'] ? 'reality' : (p.tls ? 'tls' : 'none'),
        ...base, uuid: String(p.uuid), flow: p.flow || undefined,
        path: p['ws-opts']?.path || p['h2-opts']?.path,
        host: p['ws-opts']?.headers?.Host || p['ws-opts']?.headers?.host,
        serviceName: p['grpc-opts']?.['grpc-service-name'],
        publicKey: p['reality-opts']?.['public-key'],
        shortId: p['reality-opts']?.['short-id'],
      };
    } else if (type === 'trojan') {
      const net = String(p.network || 'tcp');
      cfg = {
        protocol: 'trojan', transport: net as any, security: 'tls',
        ...base, password: String(p.password),
        path: p['ws-opts']?.path, host: p['ws-opts']?.headers?.Host,
        serviceName: p['grpc-opts']?.['grpc-service-name'],
      };
    } else if (type === 'vmess') {
      cfg = {
        protocol: 'vmess', transport: String(p.network || 'tcp') as any,
        security: p.tls ? 'tls' : 'none', ...base,
        uuid: String(p.uuid), alterId: Number(p.alterId) || 0,
        path: p['ws-opts']?.path, host: p['ws-opts']?.headers?.Host,
        serviceName: p['grpc-opts']?.['grpc-service-name'],
      };
    } else if (type === 'ss' || type === 'shadowsocks') {
      cfg = {
        protocol: 'shadowsocks', transport: 'tcp', security: 'none',
        server: base.server, port: base.port,
        method: String(p.cipher), password: String(p.password),
      };
    } else if (type === 'hysteria2' || type === 'hy2') {
      cfg = {
        protocol: 'hysteria2', transport: 'none', security: 'tls',
        server: base.server, port: base.port, password: String(p.password ?? p.auth ?? ''),
        sni: p.sni || p.servername, allowInsecure: !!p['skip-cert-verify'],
        obfs: p.obfs, obfsPassword: p['obfs-password'],
        upMbps: p.up ? Number(p.up) : undefined, downMbps: p.down ? Number(p.down) : undefined,
        alpn: p.alpn,
      };
    } else if (type === 'tuic') {
      cfg = {
        protocol: 'tuic', transport: 'none', security: 'tls',
        server: base.server, port: base.port,
        uuid: String(p.uuid), password: String(p.password),
        sni: p.sni || p.servername, allowInsecure: !!p['skip-cert-verify'],
        congestionControl: p['congestion-controller'] || 'bbr',
        udpRelayMode: p['udp-relay-mode'] || 'native', alpn: p.alpn,
      };
    }
    if (!cfg || !cfg.server || !cfg.port) return null;
    const secret = cfg.uuid || cfg.password || '';
    return {
      id: profileId(cfg.server, cfg.port, secret),
      name: String(p.name || `${cfg.protocol}-${cfg.server}`),
      groupId, config: cfg, raw: yaml.dump(p), createdAt: Date.now(),
    };
  } catch { return null; }
}

// ── sing-box / Xray JSON outbound → ProfileConfig ────────────────────────────
function singboxOutboundToProfile(o: any, groupId: string): Profile | null {
  try {
    const type = String(o.type || o.protocol || '').toLowerCase();
    const tls = o.tls || {};
    const security = tls.reality?.enabled ? 'reality' : (tls.enabled ? 'tls' : 'none');
    const tr = o.transport || {};
    const transport = (tr.type || 'tcp') as any;
    const base = {
      transport, security: security as any,
      server: String(o.server), port: Number(o.server_port || o.port),
      sni: tls.server_name, fingerprint: tls.utls?.fingerprint || 'chrome',
      alpn: tls.alpn, allowInsecure: tls.insecure,
      path: tr.path, host: tr.headers?.Host || tr.host, serviceName: tr.service_name,
      publicKey: tls.reality?.public_key, shortId: tls.reality?.short_id,
    };
    let cfg: ProfileConfig | null = null;
    if (type === 'vless') cfg = { protocol: 'vless', uuid: String(o.uuid), flow: o.flow, ...base };
    else if (type === 'trojan') cfg = { protocol: 'trojan', password: String(o.password), ...base };
    else if (type === 'vmess') cfg = { protocol: 'vmess', uuid: String(o.uuid), alterId: Number(o.alter_id) || 0, ...base };
    else if (type === 'shadowsocks') cfg = { protocol: 'shadowsocks', method: String(o.method), password: String(o.password), transport: 'tcp', security: 'none', server: String(o.server), port: Number(o.server_port) };
    else if (type === 'hysteria2') cfg = { protocol: 'hysteria2', transport: 'none', security: 'tls', server: String(o.server), port: Number(o.server_port), password: String(o.password ?? ''), sni: o.tls?.server_name, allowInsecure: o.tls?.insecure, alpn: o.tls?.alpn, obfs: o.obfs?.type, obfsPassword: o.obfs?.password, upMbps: o.up_mbps, downMbps: o.down_mbps };
    else if (type === 'tuic') cfg = { protocol: 'tuic', transport: 'none', security: 'tls', server: String(o.server), port: Number(o.server_port), uuid: String(o.uuid), password: String(o.password ?? ''), sni: o.tls?.server_name, allowInsecure: o.tls?.insecure, alpn: o.tls?.alpn, congestionControl: o.congestion_control || 'bbr', udpRelayMode: o.udp_relay_mode || 'native' };
    if (!cfg || !cfg.server || !cfg.port) return null;
    const secret = cfg.uuid || cfg.password || '';
    return {
      id: profileId(cfg.server, cfg.port, secret),
      name: String(o.tag || `${cfg.protocol}-${cfg.server}`),
      groupId, config: cfg, raw: JSON.stringify(o), createdAt: Date.now(),
    };
  } catch { return null; }
}

/** Parse a single chunk of text from any supported source into profiles. */
export function importText(text: string, groupId: string, kindHint?: ImportSourceKind): ImportResult {
  const kind = kindHint || detectKind(text);
  const profiles: Profile[] = [];
  const issues: ParseIssue[] = [];

  if (kind === 'singbox-json') {
    try {
      const j = JSON.parse(text);
      const outs: any[] = Array.isArray(j) ? j : (j.outbounds || [j]);
      outs.forEach((o, i) => {
        // Skip non-proxy outbounds (direct/block/dns/selector/urltest).
        if (['direct', 'block', 'dns', 'selector', 'urltest'].includes(String(o.type))) return;
        const p = singboxOutboundToProfile(o, groupId);
        if (p) profiles.push(p);
        else issues.push({ line: i + 1, text: String(o.tag || o.type || ''), reason: 'unsupported outbound' });
      });
    } catch (e) {
      issues.push({ line: 0, text: '(json)', reason: `invalid JSON: ${(e as Error).message}` });
    }
    return { profiles, issues };
  }

  if (kind === 'clash-yaml') {
    try {
      const doc = yaml.load(text) as any;
      const proxies: any[] = doc?.proxies || [];
      proxies.forEach((p, i) => {
        const prof = clashProxyToProfile(p, groupId);
        if (prof) profiles.push(prof);
        else issues.push({ line: i + 1, text: String(p?.name || ''), reason: 'unsupported proxy type' });
      });
    } catch (e) {
      issues.push({ line: 0, text: '(yaml)', reason: `invalid YAML: ${(e as Error).message}` });
    }
    return { profiles, issues };
  }

  // base64-sub → decode to a link list, then fall through
  let body = text;
  if (kind === 'base64-sub') body = b64decode(text.trim());

  for (const { line, text: l } of splitLines(body)) {
    const p = parseLink(l, groupId);
    if (p) profiles.push(p);
    else issues.push({ line, text: l.slice(0, 60), reason: 'unrecognised or malformed share link' });
  }
  return { profiles, issues };
}
