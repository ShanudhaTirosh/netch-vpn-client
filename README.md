<div align="center">

<img src="https://raw.githubusercontent.com/ShanudhaTirosh/BRAND_LOGOS/main/SHANUTECHX.png" alt="Netch VPN" width="160">

# Netch VPN — Desktop Client

Cross-platform desktop client for self-hosted VLESS / REALITY / Trojan
infrastructure (3x-ui server). Tauri 2 + React + TypeScript shell driving a
managed **sing-box** sidecar over its Clash-compatible API.

</div>

## Step 0 decisions

1. **UI shell: Tauri 2 + React + TS.** Performance is a stated priority. Tauri
   uses the OS webview (WebView2 / WKWebView / WebKitGTK) instead of bundling
   Chromium, so idle footprint is low-double-digit MB vs Electron's 100 MB+,
   and it reuses the React model already used on the panel. Trade-off: a thinner
   ecosystem than Electron, accepted for the resource win.
2. **Engine: bundled `sing-box` binary as a managed sidecar, controlled via the
   Clash API (HTTP + WebSocket).** Mirrors sing-box-windows / GUI.for.SingBox,
   avoids cross-compiling Go (`libbox` cgo) into the Rust/Tauri build, and gives
   push-based traffic/log/connection streams. Embedding libbox is deferred until
   the sidecar pattern proves limiting.
3. **Windows first; macOS/Linux are same-codebase follow-ups.** Largest user
   base + TUN precedent (Netch/NetMod). TUN privilege handling differs per OS
   (Step 7), so shipping all three day-one multiplies packaging/privilege work
   without a matching need yet.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri shell (Rust)                                            │
│   • sidecar manager: spawn/supervise sing-box, restart, logs   │
│   • tray: connect/disconnect/status                            │
│   • privilege elevation (TUN), system-proxy set/unset          │
│   • IPC commands ↔ React                                        │
└───────────────┬───────────────────────────────┬───────────────┘
                │ Tauri IPC                       │ spawns
                ▼                                 ▼
┌──────────────────────────────┐     ┌──────────────────────────┐
│  React UI (webview)          │     │  sing-box (sidecar)       │
│   • import / profiles        │ ◀──▶│   Clash API :9090         │
│   • dashboard / logs / set.  │ WS  │   TUN / mixed inbound     │
│   • Clash-API client (TS)    │     │   urltest, dns, routing   │
└──────────────────────────────┘     └──────────────────────────┘
```

## Brand tokens
`--netch-bg-base #03061D` · `--netch-bg-base-alt #02051D` ·
`--netch-accent #289DB7` · `--netch-slate #2B2D38`

## Supported configs (general-purpose, not server-locked)

Imports and connects to standard configs from **any** provider, via the
universal share formats — not just the Netch server:

| Source | Formats |
|---|---|
| Clipboard / file / QR / subscription URL | single link · newline list · base64 sub · Clash/Mihomo YAML · sing-box JSON |
| Protocols | VLESS, VMess, Trojan, Shadowsocks, **Hysteria2**, **TUIC**, WireGuard (via JSON/YAML) |
| Transports | TCP/RAW, WS, gRPC, HTTP/2, HTTPUpgrade, XHTTP |
| Security | none, TLS (uTLS fingerprint), REALITY |

(SSR is intentionally not supported — sing-box dropped it. Each parser fails a
single bad link with a per-line issue rather than the whole batch.)

## Repo layout
```
src/                         # React + TS frontend
  types/            profile/group/runtime models (Step 1)
  lib/import/       link/base64/clash/json parsers + dedupe (Step 1)
  lib/singbox/      profile → sing-box config generator (Step 2,4,6)
  lib/clash/        Clash-API client (HTTP + WS) (Step 2,3)
  store/            app state (zustand)
  screens/          Dashboard, Profiles, Import, Logs, Settings (Step 5)
  styles/           glassmorphism brand theme (Step 5)
src-tauri/          Rust: sidecar manager, tray, privilege, commands (Step 2,7)
  binaries/         per-platform sing-box (sidecar) — see scripts/fetch-singbox
scripts/            sing-box fetch + packaging (Step 7)
```

## Build (dev)
```bash
npm install
npm run fetch-singbox          # downloads sing-box into src-tauri/binaries/
npm run tauri dev
```

See `docs/TESTPLAN.md` (TUN capture, DNS-leak, kill-switch, latency parity) and
`docs/ASSUMPTIONS.md` (server config items to confirm).
