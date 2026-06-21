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
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn netsh(args: &[&str]) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let _ = Command::new("netsh")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(windows)]
pub fn enable_kill_switch() {
    // Idempotent: delete any stale rule first, then add the block-all-outbound rule.
    netsh(&["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")]);
    netsh(&[
        "advfirewall", "firewall", "add", "rule",
        &format!("name={RULE_NAME}"),
        "dir=out", "action=block", "enable=yes", "profile=any",
        "remoteip=0.0.0.0-255.255.255.255",
    ]);
}

#[cfg(windows)]
pub fn disable_kill_switch() {
    netsh(&["advfirewall", "firewall", "delete", "rule", &format!("name={RULE_NAME}")]);
}

#[cfg(not(windows))]
pub fn enable_kill_switch() {
    // Linux: nftables/iptables drop rule on the default route (v2).
    // macOS: pf anchor (v2). For v1 the UI surfaces the crash and TUN teardown
    // already removes the default route on most setups.
}

#[cfg(not(windows))]
pub fn disable_kill_switch() {}
