// Windows kill switch (Step 4) — fail CLOSED on unexpected sidecar crash while
// TUN is active. Implemented with a Windows Firewall rule that blocks all
// outbound; loopback stays allowed by Windows' default rules so the app/UI keep
// working. Reconnecting (singbox_stop) removes the block.
//
// This is intentionally blunt (block-all) so there is zero leak window. A
// finer-grained version (allow only the sing-box process + the physical NIC's
// gateway for the handshake) is a v2 refinement.

#[cfg(windows)]
const RULE_NAME: &str = "NetchVPN-KillSwitch-BlockOutbound";

#[cfg(windows)]
pub fn enable_kill_switch() {
    use std::process::Command;
    // Idempotent: delete any stale rule first, then add the block-all-outbound rule.
    let _ = Command::new("netsh")
        .args(["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")])
        .output();
    let _ = Command::new("netsh")
        .args([
            "advfirewall", "firewall", "add", "rule",
            &format!("name={RULE_NAME}"),
            "dir=out", "action=block", "enable=yes", "profile=any",
            "remoteip=0.0.0.0-255.255.255.255",
        ])
        .output();
}

#[cfg(windows)]
pub fn disable_kill_switch() {
    use std::process::Command;
    let _ = Command::new("netsh")
        .args(["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")])
        .output();
}

#[cfg(not(windows))]
pub fn enable_kill_switch() {
    // Linux: nftables/iptables drop rule on the default route (v2).
    // macOS: pf anchor (v2). For v1 the UI surfaces the crash and TUN teardown
    // already removes the default route on most setups.
}

#[cfg(not(windows))]
pub fn disable_kill_switch() {}
