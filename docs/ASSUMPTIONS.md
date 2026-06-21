# Assumptions to confirm against your server's actual config

These are things the client guesses because your server's exact live config
(mux, ports, transport details) wasn't available while building. Confirm before
relying on them.

## 1. Multiplex (mux) — OFF by default in the client
`AppSettings.enableMux = false`. sing-box mux only helps (and only works) if the
**server inbound** also has mux enabled, and on a REALITY/Vision TCP inbound mux
is usually NOT used. Your installer's inbounds (from the v1.2.x server build) do
**not** enable mux. Action: leave mux OFF unless you explicitly turn mux on for
the WS/Trojan-gRPC inbounds server-side — if you do, flip the Settings toggle and
confirm the protocol matches (`smux` assumed here).

## 2. XHTTP transport mapping
The client maps `xhttp` to sing-box's `http`-family transport (path/host) and does
**not** set an XHTTP `mode` client-side (server controls `packet-up`/`stream-up`).
Confirm your sing-box version's XHTTP support matches your server's XHTTP inbound
(`scMaxBufferedPosts`, `xPaddingBytes`, `mode` are server-side in your config).
If clients fail only on the XHTTP inbound, this mapping is the first suspect.

## 3. VLESS-REALITY flow
The generator sets `flow: xtls-rprx-vision` for REALITY over **tcp** transport
(matches your REALITY inbound). For REALITY over non-tcp transports it leaves flow
empty. Confirm your REALITY inbound is TCP+Vision (it is, in the server build).

## 4. Exact inbound ports / SNIs are taken from the share link, not assumed
Ports (8443 REALITY, plus the random WS/Trojan/TLS ports) and SNIs (reality
domain, `aka.ms`, panel domain) come from each imported `vless://`/`trojan://`
link — so they're whatever your panel exported. No port is hard-coded. If you
rotate ports/SNIs on the server, just re-import/refresh the subscription.

## 5. Clash API port 9090
The client runs sing-box's Clash API on `127.0.0.1:9090` with a per-launch random
secret. If 9090 is taken on a user's machine, change `clashApiPort` (Settings →
shown read-only now; make it editable if collisions occur in the field).

## 6. urltest endpoint
Latency uses `https://www.gstatic.com/generate_204` (a neutral 204 endpoint). If
that's blocked in a user's region, swap it for your own panel's health endpoint or
`http://cp.cloudflare.com/generate_204`.

## 7. sing-box version pin
`scripts/fetch-singbox.mjs` pins sing-box **1.11.0**. Config keys (`cache_file`,
`tun.stack`, DNS `action`, route `action: sniff`/`hijack-dns`) target that line.
sing-box changes schema between minors — if you bump the pin, re-verify the
generated config against that version's docs (notably the DNS module and route
`action` rules, which were restructured around 1.11/1.12).

## 8. macOS/Linux are scaffolded, not hardened
Windows is the tested target. macOS needs a signed/notarized build + utun
permission flow; Linux should ship `cap_net_admin` on the bundled sing-box at
install time (preferred over running the whole app as root) and may interact with
`systemd-resolved` for DNS. The kill switch is Windows-only in v1 (netsh); Linux
nftables / macOS pf anchors are v2.
