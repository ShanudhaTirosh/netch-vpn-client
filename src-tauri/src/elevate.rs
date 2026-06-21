// Privilege handling for TUN (Step 7). On Windows, TUN (WinTUN via sing-box)
// needs admin. We elevate ONLY when the user turns TUN on — not at app launch —
// by relaunching the app with the "runas" verb (UAC prompt). System-proxy mode
// needs no elevation, so users who decline keep a working fallback.

#[tauri::command]
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        // A reliable check: try to open the SCM / a privileged op. Simplers proxy:
        // attempt to add+remove a temp firewall rule; admin succeeds.
        use std::process::Command;
        let probe = Command::new("net").args(["session"]).output();
        return matches!(probe, Ok(o) if o.status.success());
    }
    #[cfg(unix)]
    {
        // root or cap_net_admin on the sing-box binary (preferred, see packaging).
        return unsafe { libc_geteuid() == 0 };
    }
    #[allow(unreachable_code)]
    false
}

#[cfg(unix)]
extern "C" {
    #[link_name = "geteuid"]
    fn libc_geteuid() -> u32;
}

/// Relaunch the current executable elevated (Windows UAC). Returns Ok(true) if a
/// relaunch was initiated (caller should exit the current instance).
#[tauri::command]
pub fn relaunch_elevated() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::Foundation::HWND;

        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let wide: Vec<u16> = OsStr::new(&exe).encode_wide().chain(Some(0)).collect();
        let verb: Vec<u16> = OsStr::new("runas").encode_wide().chain(Some(0)).collect();
        let r = unsafe {
            ShellExecuteW(
                0 as HWND,
                verb.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            )
        };
        // ShellExecuteW returns > 32 on success.
        return Ok((r as isize) > 32);
    }
    #[allow(unreachable_code)]
    Err("elevation not implemented on this platform; set cap_net_admin on the sing-box binary instead".into())
}
