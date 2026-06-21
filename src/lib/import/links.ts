// Share-link parsers: vless:// vmess:// trojan:// ss://  →  ProfileConfig.
// Each returns null on a link it can't parse so the batch importer can report a
// per-line issue instead of throwing.

import type { Profile, ProfileConfig, Protocol, Security, Transport } from '@/types';
import { b64decode, profileId, safeDecodeURIComponent } from './util';

function mkProfile(cfg: ProfileConfig, name: string, raw: string, groupId: string): Profile {
  const secret = cfg.uuid || cfg.password || cfg.privateKey || '';
  return {
    id: profileId(cfg.server, cfg.port, secret),
    name: name || `${cfg.protocol}-${cfg.server}:${cfg.port}`,
    groupId,
    config: cfg,
    raw,
    createdAt: Date.now(),
  };
}

function normTransport(t: string | null): Transport {
  switch ((t || 'tcp').toLowerCase()) {
    case 'ws': return 'ws';
    case 'grpc': return 'grpc';
    case 'http':
    case 'h2': return 'http';
    case 'httpupgrade': return 'httpupgrade';
    case 'xhttp':
    case 'splithttp': return 'xhttp';
    case 'quic': return 'quic';
    case 'tcp':
    case 'raw': return 'tcp';
    default: return 'tcp';
  }
}

function normSecurity(s: string | null): Security {
  switch ((s || 'none').toLowerCase()) {
    case 'reality': return 'reality';
    case 'tls':
    case 'xtls': return 'tls';
    default: return 'none';
  }
}

function applyTransportParams(cfg: ProfileConfig, q: URLSearchParams) {
  switch (cfg.transport) {
    case 'ws':
    case 'httpupgrade':
      cfg.path = q.get('path') || '/';
      cfg.host = q.get('host') || undefined;
      break;
    case 'xhttp':
      cfg.path = q.get('path') || '/';
      cfg.host = q.get('host') || undefined;
      cfg.mode = q.get('mode') || 'auto';
      break;
    case 'http':
      cfg.path = q.get('path') || '/';
      cfg.host = q.get('host') || undefined;
      break;
    case 'grpc':
      cfg.serviceName = q.get('serviceName') || q.get('servicename') || '';
      break;
  }
}

function applyTlsParams(cfg: ProfileConfig, q: URLSearchParams) {
  if (cfg.security === 'tls' || cfg.security === 'reality') {
    cfg.sni = q.get('sni') || q.get('peer') || cfg.host || undefined;
    cfg.fingerprint = q.get('fp') || 'chrome';
    const alpn = q.get('alpn');
    if (alpn) cfg.alpn = alpn.split(',').map((a) => a.trim()).filter(Boolean);
    cfg.allowInsecure = q.get('allowInsecure') === '1' || q.get('insecure') === '1';
  }
  if (cfg.security === 'reality') {
    cfg.publicKey = q.get('pbk') || undefined;
    cfg.shortId = q.get('sid') || undefined;
    cfg.spiderX = q.get('spx') || undefined;
  }
}

/** vless://uuid@host:port?type=&security=&sni=&fp=&pbk=&sid=&flow=&path=&host=&serviceName=&mode=#name */
export function parseVless(link: string, groupId: string): Profile | null {
  try {
    const u = new URL(link);
    if (u.protocol !== 'vless:') return null;
    const q = u.searchParams;
    const cfg: ProfileConfig = {
      protocol: 'vless',
      transport: normTransport(q.get('type')),
      security: normSecurity(q.get('security')),
      server: u.hostname,
      port: Number(u.port) || 443,
      uuid: decodeURIComponent(u.username),
      flow: q.get('flow') || undefined,
    };
    applyTransportParams(cfg, q);
    applyTlsParams(cfg, q);
    return mkProfile(cfg, safeDecodeURIComponent(u.hash.slice(1)), link, groupId);
  } catch { return null; }
}

/** trojan://password@host:port?security=tls&type=&sni=&path=&host=&serviceName=#name */
export function parseTrojan(link: string, groupId: string): Profile | null {
  try {
    const u = new URL(link);
    if (u.protocol !== 'trojan:') return null;
    const q = u.searchParams;
    const cfg: ProfileConfig = {
      protocol: 'trojan',
      transport: normTransport(q.get('type')),
      security: normSecurity(q.get('security') || 'tls'),
      server: u.hostname,
      port: Number(u.port) || 443,
      password: decodeURIComponent(u.username),
    };
    applyTransportParams(cfg, q);
    applyTlsParams(cfg, q);
    return mkProfile(cfg, safeDecodeURIComponent(u.hash.slice(1)), link, groupId);
  } catch { return null; }
}

/** vmess://base64(JSON{v,ps,add,port,id,aid,net,type,host,path,tls,sni,...}) */
export function parseVmess(link: string, groupId: string): Profile | null {
  try {
    const json = b64decode(link.replace(/^vmess:\/\//i, ''));
    if (!json) return null;
    const o = JSON.parse(json) as Record<string, any>;
    const sec = (o.tls === 'reality') ? 'reality' : (o.tls ? 'tls' : 'none');
    const cfg: ProfileConfig = {
      protocol: 'vmess',
      transport: normTransport(o.net),
      security: sec as Security,
      server: String(o.add),
      port: Number(o.port) || 443,
      uuid: String(o.id),
      alterId: Number(o.aid) || 0,
      sni: o.sni || o.host || undefined,
      host: o.host || undefined,
      path: o.path || (o.net === 'grpc' ? undefined : '/'),
      serviceName: o.net === 'grpc' ? (o.path || '') : undefined,
      fingerprint: o.fp || 'chrome',
      alpn: o.alpn ? String(o.alpn).split(',').map((a: string) => a.trim()) : undefined,
    };
    return mkProfile(cfg, String(o.ps || ''), link, groupId);
  } catch { return null; }
}

/** ss://base64(method:password)@host:port#name  OR  ss://base64(method:password@host:port)#name */
export function parseShadowsocks(link: string, groupId: string): Profile | null {
  try {
    const rest = link.replace(/^ss:\/\//i, '');
    const hashIdx = rest.indexOf('#');
    const name = hashIdx >= 0 ? safeDecodeURIComponent(rest.slice(hashIdx + 1)) : '';
    let body = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    // Strip plugin query if present
    body = body.split('?')[0];

    let method = '', password = '', host = '', port = 0;
    if (body.includes('@')) {
      // ss://base64(method:password)@host:port
      const [credEnc, hp] = body.split('@');
      const cred = b64decode(credEnc) || credEnc;
      [method, password] = cred.split(':');
      const m = hp.match(/^\[?([^\]]+)\]?:(\d+)$/);
      if (m) { host = m[1]; port = Number(m[2]); }
    } else {
      // ss://base64(method:password@host:port)
      const dec = b64decode(body);
      const at = dec.lastIndexOf('@');
      const cred = dec.slice(0, at);
      const hp = dec.slice(at + 1);
      [method, password] = cred.split(':');
      const m = hp.match(/^\[?([^\]]+)\]?:(\d+)$/);
      if (m) { host = m[1]; port = Number(m[2]); }
    }
    if (!host || !port) return null;
    const cfg: ProfileConfig = {
      protocol: 'shadowsocks',
      transport: 'tcp',
      security: 'none',
      server: host,
      port,
      method,
      password,
    };
    return mkProfile(cfg, name, link, groupId);
  } catch { return null; }
}

/** hysteria2://password@host:port?sni=&insecure=&obfs=&obfs-password=&up=&down=#name
    (also accepts hy2:// alias) */
export function parseHysteria2(link: string, groupId: string): Profile | null {
  try {
    const u = new URL(link.replace(/^hy2:\/\//i, 'hysteria2://'));
    if (u.protocol !== 'hysteria2:') return null;
    const q = u.searchParams;
    const cfg: ProfileConfig = {
      protocol: 'hysteria2',
      transport: 'none',
      security: 'tls',
      server: u.hostname,
      port: Number(u.port) || 443,
      password: decodeURIComponent(u.username + (u.password ? `:${u.password}` : '')),
      sni: q.get('sni') || u.hostname,
      allowInsecure: q.get('insecure') === '1',
      obfs: q.get('obfs') || undefined,
      obfsPassword: q.get('obfs-password') || undefined,
      upMbps: q.get('up') ? Number(q.get('up')) : undefined,
      downMbps: q.get('down') ? Number(q.get('down')) : undefined,
    };
    const alpn = q.get('alpn'); if (alpn) cfg.alpn = alpn.split(',').map((a) => a.trim());
    return mkProfile(cfg, safeDecodeURIComponent(u.hash.slice(1)), link, groupId);
  } catch { return null; }
}

/** tuic://uuid:password@host:port?sni=&alpn=&congestion_control=&udp_relay_mode=#name */
export function parseTuic(link: string, groupId: string): Profile | null {
  try {
    const u = new URL(link);
    if (u.protocol !== 'tuic:') return null;
    const q = u.searchParams;
    const cfg: ProfileConfig = {
      protocol: 'tuic',
      transport: 'none',
      security: 'tls',
      server: u.hostname,
      port: Number(u.port) || 443,
      uuid: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      sni: q.get('sni') || u.hostname,
      allowInsecure: q.get('allow_insecure') === '1' || q.get('insecure') === '1',
      congestionControl: q.get('congestion_control') || 'bbr',
      udpRelayMode: q.get('udp_relay_mode') || 'native',
    };
    const alpn = q.get('alpn'); if (alpn) cfg.alpn = alpn.split(',').map((a) => a.trim());
    return mkProfile(cfg, safeDecodeURIComponent(u.hash.slice(1)), link, groupId);
  } catch { return null; }
}

/** Dispatch a single share link to the right parser. */
export function parseLink(link: string, groupId: string): Profile | null {
  const l = link.trim();
  if (/^vless:\/\//i.test(l)) return parseVless(l, groupId);
  if (/^trojan:\/\//i.test(l)) return parseTrojan(l, groupId);
  if (/^vmess:\/\//i.test(l)) return parseVmess(l, groupId);
  if (/^ss:\/\//i.test(l)) return parseShadowsocks(l, groupId);
  if (/^(hysteria2|hy2):\/\//i.test(l)) return parseHysteria2(l, groupId);
  if (/^tuic:\/\//i.test(l)) return parseTuic(l, groupId);
  return null;
}

export const SUPPORTED_SCHEMES: Protocol[] = ['vless', 'trojan', 'vmess', 'shadowsocks', 'hysteria2', 'tuic'];
