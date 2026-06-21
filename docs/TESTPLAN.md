# Netch VPN client — verification test plan

Run on Windows 10/11 first (primary target). `[admin]` = elevated shell/app.

## 0. Build & launch
```bash
npm install
npm run fetch-singbox            # places sing-box sidecar in src-tauri/binaries/
npm run tauri dev                # dev; or `npm run tauri build` for installers
```
Import a profile (Import → paste a `vless://…` from your panel, or Add subscription).

## 1. TUN captures ALL system traffic (not just the browser)
Goal: prove system-wide capture, not a browser-only proxy.
1. Settings → Default mode = **TUN**. Connect (accept the UAC prompt).
2. In a terminal (NOT a browser): `curl https://api.ipify.org` → must return the
   **server's** egress IP, not your ISP IP.
3. `ping 1.1.1.1` and a non-browser app (e.g. a game/Steam) → traffic still works,
   confirming non-HTTP + non-browser flows are tunneled.
4. Windows: `route print` while connected → a default route via the TUN adapter
   (`172.19.0.1`) should be present. Disconnect → it disappears.

## 2. No DNS leak
1. Connected in TUN mode, open https://dnsleaktest.com (Extended test) → resolver(s)
   should be the proxy-side resolver (Cloudflare via `remote`), **not** your ISP/router.
2. CLI cross-check: `nslookup example.com` → should resolve via the tunnel.
   On Windows also run `Get-DnsClientServerAddress` — the TUN adapter should be the
   active resolver path; queries must not hit the LAN gateway.
3. In Logs, confirm sing-box shows DNS routed through `remote`/`proxy`, not `local`,
   for non-private domains.

## 3. Kill switch blocks traffic on a simulated sidecar crash
1. Settings → Kill switch = ON. Connect in TUN mode.
2. Simulate a crash: `[admin] taskkill /IM sing-box.exe /F` (Windows) /
   `pkill -9 sing-box` (Linux/macOS).
3. App should show **"Kill switch engaged"** and the firewall block rule
   `NetchVPN-KillSwitch-BlockOutbound` should exist:
   `netsh advfirewall firewall show rule name=NetchVPN-KillSwitch-BlockOutbound`.
4. `curl https://api.ipify.org` → must **fail/timeout** (no leak to raw IP).
5. Reconnect (or Disconnect) → block rule removed, connectivity restored:
   `netsh advfirewall firewall show rule name=NetchVPN-KillSwitch-BlockOutbound`
   → "No rules match".

## 4. UI latency matches a manual curl through the same proxy
1. Connected. Profiles → "Test all" → note the ms badge for the active profile.
2. Manual reference through the same node: temporarily run sing-box in System-proxy
   mode (mixed inbound on 127.0.0.1:2080), then:
   `curl -x socks5h://127.0.0.1:2080 -o NUL -s -w "%{time_total}\n" https://www.gstatic.com/generate_204`
   ×5 and average → should be within ~10–20% of the UI's URL-test number (both
   include TLS handshake). TCP-ping ("ping" button) will be lower — that's connect
   time only, by design.

## 5. Per-protocol connectivity (server's 5 inbounds)
For each: import its link, Connect, confirm egress IP changes + a real page loads:
- VLESS+REALITY (SNI = reality domain) · VLESS+TLS-Vision (SNI = aka.ms) ·
  VLESS+WS · VLESS+XHTTP · Trojan+gRPC.
Check Logs for handshake errors per protocol.

## 6. Idle resource budget (Step 6 target)
Connected + idle (no active transfer), check Task Manager:
- Target: webview + Rust shell in **low-double-digit MB**; sing-box a few MB;
  CPU **~0%** at idle (push-based stats, no polling).
- Start a download → CPU rises with throughput, returns to ~0 when idle.

## 7. Tray + lifecycle
- Close window → app hides to tray (doesn't quit). Tray → Connect/Disconnect work
  without opening the window. Tray → Quit → sing-box process gone
  (`tasklist | findstr sing-box` empty) and no leftover firewall rule.
- Crash/auto-reconnect: drop the network briefly → app should surface the drop and
  (if implemented in your build) reconnect with backoff, not a tight retry loop.
