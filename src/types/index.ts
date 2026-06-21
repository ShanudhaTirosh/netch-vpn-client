// ── Core data model (Step 1) ────────────────────────────────────────────────
// Each imported config is a Profile that belongs to a Group. A Group is either
// a subscription source (with a refreshable URL) or the synthetic "Manual" group
// for one-off pasted/scanned links.

export type Protocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'socks'
  | 'http';

export type Transport = 'tcp' | 'ws' | 'grpc' | 'http' | 'httpupgrade' | 'xhttp' | 'quic' | 'none';

export type Security = 'none' | 'tls' | 'reality';

/** Normalised connection parameters parsed from a share link / config. */
export interface ProfileConfig {
  protocol: Protocol;
  transport: Transport;
  security: Security;

  server: string;
  port: number;

  // Credentials (protocol-dependent; only the relevant ones are set).
  uuid?: string;        // vless / vmess
  password?: string;    // trojan / shadowsocks
  method?: string;      // shadowsocks cipher
  flow?: string;        // vless xtls-rprx-vision
  alterId?: number;     // vmess (legacy)

  // TLS / REALITY
  sni?: string;
  alpn?: string[];
  fingerprint?: string; // utls fingerprint, e.g. "chrome"
  allowInsecure?: boolean;
  publicKey?: string;   // reality
  shortId?: string;     // reality
  spiderX?: string;     // reality

  // Transport-specific
  path?: string;        // ws / xhttp / httpupgrade
  host?: string;        // ws/http Host header
  serviceName?: string; // grpc
  mode?: string;        // xhttp mode (packet-up/stream-up/auto)

  // WireGuard (WARP)
  privateKey?: string;
  peerPublicKey?: string;
  localAddress?: string[];
  reserved?: number[];
  mtu?: number;

  // Hysteria2 / TUIC
  obfs?: string;              // hysteria2 obfs type, e.g. "salamander"
  obfsPassword?: string;
  upMbps?: number;
  downMbps?: number;
  congestionControl?: string; // tuic: "bbr" | "cubic" | "new_reno"
  udpRelayMode?: string;      // tuic: "native" | "quic"
}

export interface Profile {
  id: string;                 // stable id = hash(server:port:uuid|password)
  name: string;               // editable display name (from #fragment or generated)
  groupId: string;
  config: ProfileConfig;
  raw: string;                // original share link or JSON, for re-export/debug
  lastLatencyMs?: number;     // last URL-test result, -1 = unreachable
  lastTcpMs?: number;
  lastConnectedAt?: number;   // epoch ms
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  kind: 'manual' | 'subscription';
  url?: string;               // subscription source URL
  autoUpdateMinutes?: number; // 0 = off
  lastUpdatedAt?: number;
  createdAt: number;
}

export const MANUAL_GROUP_ID = 'manual';

// ── Runtime / connection state ───────────────────────────────────────────────

export type ConnectionMode = 'tun' | 'system';
export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TrafficSample {
  up: number;   // bytes/sec
  down: number; // bytes/sec
  ts: number;
}

export interface AppSettings {
  defaultMode: ConnectionMode;
  autoStartOnBoot: boolean;
  killSwitch: boolean;
  subAutoUpdateMinutes: number;
  clashApiPort: number;
  tunStack: 'system' | 'gvisor' | 'mixed';
  enableMux: boolean;
  enableTcpFastOpen: boolean;
  allowInsecureTls: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultMode: 'tun',
  autoStartOnBoot: false,
  killSwitch: true,
  subAutoUpdateMinutes: 720, // 12h, matches the server's subUpdates default
  clashApiPort: 9090,
  tunStack: 'mixed',
  enableMux: false,          // off until server-side mux is confirmed (see ASSUMPTIONS)
  enableTcpFastOpen: true,
  // For self-hosted servers using SNI camouflage (e.g. sni=aka.ms while the cert
  // is for your real domain), the cert won't match the SNI — enable this to skip
  // TLS cert verification. Off by default (verification on).
  allowInsecureTls: false,
};

/** One parse failure (per-line), so a messy paste reports which lines failed
    instead of failing the whole batch. */
export interface ParseIssue {
  line: number;
  text: string;
  reason: string;
}

export interface ImportResult {
  profiles: Profile[];
  issues: ParseIssue[];
}
