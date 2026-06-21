// sing-box sidecar lifecycle (Step 2) + TCP ping (Step 3) + kill switch (Step 4).
//
// The sidecar is the official sing-box binary shipped under src-tauri/binaries/
// (see scripts/fetch-singbox). We write the generated config to a managed dir,
// spawn `sing-box run -c <config>`, stream stderr/stdout to the UI as log
// events, and supervise it: clean shutdown on app exit, auto-restart with
// backoff on unexpected crash, and a kill switch that fails traffic CLOSED
// rather than leaking to the raw connection.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
pub struct SidecarState {
    pub child: Mutex<Option<CommandChild>>,
    pub connected: Mutex<bool>,
    pub kill_switch: Mutex<bool>,
    pub tun_mode: Mutex<bool>,
}

#[derive(Clone, Serialize)]
struct LogLine {
    stream: &'static str,
    line: String,
}

/// Shared teardown used by both the start (pre-clean) and stop commands, and the
/// tray Quit handler. Marks the stop intentional so the exit watcher skips the
/// kill switch, kills the child, and clears any kill-switch firewall rule.
fn do_stop(app: &AppHandle, st: &SidecarState) {
    *st.connected.lock().unwrap() = false;
    let child = st.child.lock().unwrap().take();
    if let Some(c) = child {
        let _ = c.kill();
    }
    #[cfg(windows)]
    crate::netfw::disable_kill_switch();
    let _ = app.emit("singbox-exit", Some(0i32));
}

/// Writes `config_json` to the app config dir and spawns the sing-box sidecar.
/// Streams stdout/stderr to the frontend via the "singbox-log" event and emits
/// "singbox-exit" when the process ends.
#[tauri::command]
pub async fn singbox_start(
    app: AppHandle,
    state: State<'_, SidecarState>,
    config_json: String,
    tun_mode: bool,
    kill_switch: bool,
) -> Result<(), String> {
    // Stop any prior instance first.
    do_stop(&app, state.inner());

    let cfg_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&cfg_dir).map_err(|e| e.to_string())?;
    let cfg_path = cfg_dir.join("singbox.json");
    std::fs::write(&cfg_path, config_json).map_err(|e| e.to_string())?;

    let sidecar = app
        .shell()
        .sidecar("sing-box")
        .map_err(|e| e.to_string())?
        // Run IN the writable app-config dir so sing-box's cache.db (relative
        // path) is created somewhere writable. Without this it tries the
        // process CWD (often Program Files / System32 when elevated) → the
        // "initialize cache-file: open cache.db: Access is denied" FATAL.
        .current_dir(cfg_dir.clone())
        .args(["run", "-c", cfg_path.to_string_lossy().as_ref()]);

    let (mut rx, child) = sidecar.spawn().map_err(|e| e.to_string())?;

    *state.child.lock().unwrap() = Some(child);
    *state.connected.lock().unwrap() = true;
    *state.kill_switch.lock().unwrap() = kill_switch;
    *state.tun_mode.lock().unwrap() = tun_mode;

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                    let line = String::from_utf8_lossy(&b).trim_end().to_string();
                    if !line.is_empty() {
                        let _ = app2.emit("singbox-log", LogLine { stream: "stderr", line });
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let st: State<SidecarState> = app2.state();
                    let was_connected = *st.connected.lock().unwrap();
                    let ks = *st.kill_switch.lock().unwrap();
                    let tun = *st.tun_mode.lock().unwrap();
                    *st.connected.lock().unwrap() = false;
                    *st.child.lock().unwrap() = None;

                    // Unexpected crash while connected → kill switch.
                    if was_connected {
                        if ks && tun {
                            #[cfg(windows)]
                            crate::netfw::enable_kill_switch();
                            let _ = app2.emit("kill-switch-engaged", true);
                        }
                        let _ = app2.emit("singbox-exit", payload.code);
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn singbox_stop(
    app: AppHandle,
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    do_stop(&app, state.inner());
    Ok(())
}

#[tauri::command]
pub fn singbox_running(state: State<'_, SidecarState>) -> bool {
    *state.connected.lock().unwrap()
}

/// Raw TCP connect time in ms (Step 3 tier 1). -1 on failure.
#[tauri::command]
pub async fn tcp_ping(host: String, port: u16, timeout_ms: u64) -> i64 {
    use tokio::net::TcpStream;
    let addr = format!("{host}:{port}");
    let start = Instant::now();
    let fut = TcpStream::connect(&addr);
    match tokio::time::timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(Ok(_stream)) => start.elapsed().as_millis() as i64,
        _ => -1,
    }
}
