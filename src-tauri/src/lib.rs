mod sidecar;
mod elevate;
mod netfw;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use sidecar::SidecarState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(SidecarState::default())
        .setup(|app| {
            // ── System tray (Step 5: connect/status without the main window) ──
            let show = MenuItem::with_id(app, "show", "Open Netch VPN", true, None::<&str>)?;
            let connect = MenuItem::with_id(app, "connect", "Connect", true, None::<&str>)?;
            let disconnect = MenuItem::with_id(app, "disconnect", "Disconnect", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &connect, &disconnect, &quit])?;

            TrayIconBuilder::with_id("netch-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Netch VPN")
                .menu(&menu)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
                    "connect" => { let _ = app.emit("tray-connect", ()); }
                    "disconnect" => { let _ = app.emit("tray-disconnect", ()); }
                    "quit" => {
                        // Ensure the sidecar + kill switch are torn down before exit.
                        let st: tauri::State<SidecarState> = app.state();
                        if let Some(c) = st.child.lock().unwrap().take() { let _ = c.kill(); }
                        #[cfg(windows)]
                        netfw::disable_kill_switch();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::DoubleClick { .. } = ev {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
                    }
                })
                .build(app)?;
            Ok(())
        })
        // Close-to-tray: hide instead of quitting, like every VPN client.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::singbox_start,
            sidecar::singbox_stop,
            sidecar::singbox_running,
            sidecar::tcp_ping,
            elevate::is_elevated,
            elevate::relaunch_elevated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Netch VPN");
}
