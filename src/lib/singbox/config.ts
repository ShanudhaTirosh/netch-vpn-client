// Profile → sing-box config generator (Steps 2, 4, 6).
// Produces a complete sing-box JSON: DNS (remote resolution), inbound (TUN or
// mixed), outbounds (one per profile) + a urltest "auto" group + a "proxy"
// selector, routing (LAN/loopback direct, DNS hijack), and the Clash API +
// cache_file experimental block.

import type { AppSettings, ConnectionMode, Profile, ProfileConfig } from '@/types';

const URLTEST_URL = 'https://www.gstatic.com/generate_204';

function tlsBlock(c: ProfileConfig) {
  if (c.security === 'none') return undefined;
  const tls: any = {
    enabled: true,
    server_name: c.sni || c.host || c.server,
    insecure: !!c.allowInsecure,
    utls: { enabled: true, fingerprint: c.fingerprint || 'chrome' },
  };
  if (c.alpn?.length) tls.alpn = c.alpn;
  if (c.security === 'reality') {
    tls.reality = {
      enabled: true,
      public_key: c.publicKey,
      short_id: c.shortId || '',
    };
  }
  return tls;
}

function transportBlock(c: ProfileConfig) {
  switch (c.transport) {
    case 'ws':
      return { type: 'ws', path: c.path || '/', headers: c.host ? { Host: c.host } : undefined };
    case 'httpupgrade':
      return { type: 'httpupgrade', path: c.path || '/', host: c.host };
    case 'grpc':
      return { type: 'grpc', service_name: c.serviceName || '' };
    case 'http':
      return { type: 'http', path: c.path || '/', host: c.host ? [c.host] : undefined };
    case 'xhttp':
      // sing-box maps XHTTP/SplitHTTP to the "http" transport family on the
      // client; mode is server-side. Confirm against server (see ASSUMPTIONS).
      return { type: 'http', path: c.path || '/', host: c.host ? [c.host] : undefined };
    default:
      return undefined; // tcp/raw → no transport block
  }
}

function muxBlock(enable: boolean) {
  return enable ? { enabled: true, protocol: 'smux', max_streams: 8, padding: false } : undefined;
}

/** One profile → one sing-box outbound. tag = profile.id (stable, used by the
    Clash API to switch / display). */
export function profileToOutbound(p: Profile, settings: AppSettings): any {
  const c = p.config;
  const common: any = { tag: p.id, server: c.server, server_port: c.port };
  const tls = tlsBlock(c);
  const transport = transportBlock(c);
  const mux = muxBlock(settings.enableMux);

  switch (c.protocol) {
    case 'vless':
      return {
        type: 'vless', ...common, uuid: c.uuid,
        flow: c.flow || (c.security === 'reality' && c.transport === 'tcp' ? 'xtls-rprx-vision' : ''),
        ...(tls ? { tls } : {}), ...(transport ? { transport } : {}), ...(mux ? { multiplex: mux } : {}),
      };
    case 'trojan':
      return {
        type: 'trojan', ...common, password: c.password,
        ...(tls ? { tls } : {}), ...(transport ? { transport } : {}), ...(mux ? { multiplex: mux } : {}),
      };
    case 'vmess':
      return {
        type: 'vmess', ...common, uuid: c.uuid, security: 'auto', alter_id: c.alterId || 0,
        ...(tls ? { tls } : {}), ...(transport ? { transport } : {}), ...(mux ? { multiplex: mux } : {}),
      };
    case 'shadowsocks':
      return { type: 'shadowsocks', ...common, method: c.method, password: c.password, ...(mux ? { multiplex: mux } : {}) };
    case 'hysteria2':
      return {
        type: 'hysteria2', ...common, password: c.password,
        ...(c.obfs ? { obfs: { type: c.obfs, password: c.obfsPassword } } : {}),
        ...(c.upMbps ? { up_mbps: c.upMbps } : {}),
        ...(c.downMbps ? { down_mbps: c.downMbps } : {}),
        tls: { enabled: true, server_name: c.sni || c.server, insecure: !!c.allowInsecure, alpn: c.alpn || ['h3'] },
      };
    case 'tuic':
      return {
        type: 'tuic', ...common, uuid: c.uuid, password: c.password,
        congestion_control: c.congestionControl || 'bbr',
        udp_relay_mode: c.udpRelayMode || 'native',
        tls: { enabled: true, server_name: c.sni || c.server, insecure: !!c.allowInsecure, alpn: c.alpn || ['h3'] },
      };
    case 'wireguard':
      return {
        type: 'wireguard', ...common, local_address: c.localAddress || ['172.16.0.2/32'],
        private_key: c.privateKey, peer_public_key: c.peerPublicKey, reserved: c.reserved, mtu: c.mtu || 1408,
      };
    default:
      return { type: 'direct', tag: p.id };
  }
}

function inboundBlock(mode: ConnectionMode, settings: AppSettings) {
  if (mode === 'tun') {
    return [{
      type: 'tun',
      tag: 'tun-in',
      // IPv4-only TUN avoids IPv6 auto_route failures on hosts with partial/no
      // IPv6 — a common "connected but nothing flows" cause on Windows.
      address: ['172.19.0.1/30'],
      auto_route: true,
      strict_route: false,             // strict_route can blackhole traffic on some Windows setups
      stack: settings.tunStack,        // mixed = gVisor for TCP + system for UDP
      mtu: 9000,
    }];
  }
  // System-proxy fallback: a single mixed (SOCKS+HTTP) listener the app points
  // the OS system proxy at.
  return [{
    type: 'mixed',
    tag: 'mixed-in',
    listen: '127.0.0.1',
    listen_port: 2080,
    set_system_proxy: false,           // the Rust side sets it explicitly (Step 7)
  }];
}

export interface BuildOptions {
  profiles: Profile[];     // candidate set (active group) — become urltest members
  selectedId: string;      // the user's chosen profile (selector default)
  settings: AppSettings;
  mode: ConnectionMode;
}

export function buildSingboxConfig({ profiles, selectedId, settings, mode }: BuildOptions): any {
  const proxyOutbounds = profiles.map((p) => profileToOutbound(p, settings));
  const proxyTags = proxyOutbounds.map((o) => o.tag);

  const outbounds: any[] = [
    // Manual selector — Clash API PUT /proxies/proxy switches this.
    { type: 'selector', tag: 'proxy', outbounds: ['auto', ...proxyTags], default: selectedId || 'auto' },
    // Engine-driven auto-select-fastest (Step 3).
    { type: 'urltest', tag: 'auto', outbounds: proxyTags, url: URLTEST_URL, interval: '3m', tolerance: 50 },
    ...proxyOutbounds,
    { type: 'direct', tag: 'direct' },
  ];
  // NOTE: the legacy `block` and `dns` special outbounds were removed — sing-box
  // 1.11+ handles those via route rule-actions (`action: "reject"` /
  // `action: "hijack-dns"`), which this config uses below.

  return {
    log: { level: 'info', timestamp: true },

    // DNS (Step 4): app/proxy queries resolved remotely through the proxy to
    // avoid leaking to the LAN resolver; a local resolver only for direct rules.
    dns: {
      servers: [
        { tag: 'remote', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { tag: 'local', address: 'https://223.5.5.5/dns-query', detour: 'direct' },
      ],
      rules: [
        { outbound: 'any', server: 'local' },           // bootstrap resolver addresses directly
        { clash_mode: 'Direct', server: 'local' },
        { clash_mode: 'Global', server: 'remote' },
      ],
      final: 'remote',
      strategy: 'prefer_ipv4',
      independent_cache: true,
    },

    inbounds: inboundBlock(mode, settings),

    outbounds,

    route: {
      auto_detect_interface: true,
      final: 'proxy',
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },        // capture DNS → sing-box DNS module
        { ip_is_private: true, outbound: 'direct' },       // LAN/loopback always direct (Step 4)
        { clash_mode: 'Direct', outbound: 'direct' },
        { clash_mode: 'Global', outbound: 'proxy' },
      ],
    },

    experimental: {
      clash_api: {
        external_controller: `127.0.0.1:${settings.clashApiPort}`,
        // secret is set by the Rust side per-launch and injected here.
      },
      cache_file: {
        enabled: true,           // faster reconnects + warm DNS/urltest cache (Step 6)
        store_fakeip: true,
      },
    },
  };
}
