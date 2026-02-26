//! Helsinki Twitch Overlay — Tauri application entry point.
//!
//! 16-step initialization sequence:
//! 1. Tracing → 2. Data dir → 3. DB → 4. Word filter → 5. Settings
//! 6-9. App services → 10. Printer keepalive → 11-12. Twitch token
//! 13. EventSub → 14. Notification → 15. Web server → 16. Token refresh

pub mod app;
pub mod background;
mod bootstrap;
mod chat_filter;
mod commands;
pub mod config;
pub mod events;
mod eventsub_events;
mod eventsub_handler;
mod eventsub_support;
mod notification;
pub mod server;
pub mod services;
mod shutdown;
mod tray;
mod window;

use std::path::PathBuf;

use overlay_db::Database;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::prelude::*;

use config::AppConfig;

#[tauri::command]
fn get_server_port(state: tauri::State<'_, app::SharedState>) -> u16 {
    state.server_port()
}

#[tauri::command]
fn get_version() -> &'static str {
    "1.0.0"
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn restart_server(state: tauri::State<'_, app::SharedState>) -> Result<u16, String> {
    state
        .restart_server()
        .await
        .map_err(|e| format!("Failed to restart server: {e}"))
}

/// Steps 1-5: Foundation init (fatal on error).
pub fn init_foundation() -> Result<(Database, AppConfig, PathBuf), anyhow::Error> {
    bootstrap::init_foundation()
}

/// Public wrapper for starting the EventSub handler loop.
pub async fn run_eventsub_handler(state: app::SharedState) {
    eventsub_handler::run(state).await;
}

/// Public wrapper for initializing the notification system.
pub async fn init_notification_system(state: app::SharedState) {
    notification::initialize(&state).await;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Step 1: Tracing
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .with(services::log_buffer::LogCaptureLayer::new())
        .init();

    // Steps 2-5: Foundation (fatal)
    let (db, config, dir) = init_foundation().expect("Failed to initialize");
    let shared_state = app::SharedState::new(db, config, dir);
    let db_for_window = shared_state.db().clone();
    let setup_state = shared_state.clone();
    let shutdown_state = shared_state.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state.clone())
        .setup(move |app| {
            bootstrap::spawn_background_tasks(app, setup_state);
            if let Err(e) = tray::setup_tray(app.handle()) {
                tracing::error!("Failed to initialize tray icon: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            get_version,
            quit_app,
            restart_server
        ])
        .on_window_event(move |win, event| {
            use tauri::WindowEvent;
            match event {
                WindowEvent::CloseRequested { api, .. } if win.label() == "main" => {
                    api.prevent_close();
                    let _ = win.hide();
                }
                WindowEvent::Moved(_) if win.label() == "main" => {
                    window::position::on_window_moved(win, &db_for_window);
                }
                WindowEvent::Resized(_) if win.label() == "main" => {
                    window::position::on_window_resized(win, &db_for_window);
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let mut shutdown_started = false;
    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if shutdown_started {
                return;
            }
            shutdown_started = true;
            tauri::async_runtime::block_on(shutdown::graceful_shutdown(&shutdown_state));
        }
    });
}
