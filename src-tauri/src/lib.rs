//! Helsinki Twitch Overlay — Tauri application entry point.
//!
//! 16-step initialization sequence:
//! 1. Tracing → 2. Data dir → 3. DB → 4. Word filter → 5. Settings
//! 6-9. App services → 10. Printer keepalive → 11-12. Twitch token
//! 13. EventSub → 14. Notification → 15. Web server → 16. Token refresh

pub mod app;
pub mod background;
mod commands;
pub mod config;
pub mod events;
mod eventsub_events;
mod eventsub_handler;
mod eventsub_support;
mod notification;
pub mod server;
pub mod services;
mod window;

use std::path::PathBuf;

use overlay_db::Database;
use tauri::Manager;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::prelude::*;

use config::{AppConfig, SettingsManager};
use word_filter::seed_default_words;

#[tauri::command]
fn get_server_port(state: tauri::State<'_, app::SharedState>) -> u16 {
    state.server_port()
}

#[tauri::command]
fn get_version() -> &'static str {
    "1.0.0"
}

/// Determine the data directory for the application.
fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("TWITCH_OVERLAY_DATA_DIR") {
        return PathBuf::from(dir);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".twitch-overlay")
}

/// Load .env from multiple candidate paths.
fn load_dotenv() {
    let candidates = [".env", "../.env", "../../.env"];
    for path in &candidates {
        if dotenvy::from_filename(path).is_ok() {
            tracing::info!("Loaded .env from: {path}");
            return;
        }
    }
    tracing::info!("No .env file found, using system environment variables");
}

/// Steps 1-5: Foundation init (fatal on error).
pub fn init_foundation() -> Result<(Database, AppConfig, PathBuf), anyhow::Error> {
    load_dotenv();
    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;

    let db_path = dir.join("local.db");
    tracing::info!("Opening database at {}", db_path.display());
    let db = Database::open(&db_path)?;

    if let Err(e) = seed_default_words(&db) {
        tracing::error!("Failed to seed word-filter defaults: {e}");
    }

    let sm = SettingsManager::new(db.clone());
    if let Err(e) = sm.migrate_from_env() {
        tracing::error!("Failed to migrate from env: {e}");
    }
    sm.initialize_defaults()?;
    migrate_legacy_settings(&sm);

    let config = AppConfig::load(&sm)?;

    if let Ok(status) = sm.check_feature_status() {
        if !status.missing_settings.is_empty() {
            tracing::warn!(
                "Missing settings: {:?}, warnings: {:?}",
                status.missing_settings,
                status.warnings
            );
        }
    }

    tracing::info!("Settings loaded (port={})", config.server_port);
    Ok((db, config, dir))
}

/// Migrate legacy translation settings (ISO 639-3 → Chrome codes).
fn migrate_legacy_settings(sm: &SettingsManager) {
    let keys = [
        "MIC_TRANSCRIPT_TRANSLATION_LANGUAGE",
        "MIC_TRANSCRIPT_TRANSLATION2_LANGUAGE",
        "MIC_TRANSCRIPT_TRANSLATION3_LANGUAGE",
        "MIC_TRANSCRIPT_SPEECH_LANGUAGE",
    ];
    for key in &keys {
        let val = sm.get_setting(key).unwrap_or_default();
        let migrated = match val.as_str() {
            "jpn" => "ja",
            "eng" => "en",
            "kor" => "ko",
            "zho" => "zh",
            "spa" => "es",
            "fra" => "fr",
            "deu" => "de",
            _ => continue,
        };
        tracing::info!("Migrating {key}: {val} → {migrated}");
        let _ = sm.set_setting(key, migrated);
    }
}

/// Steps 10-16: Spawn all background tasks (non-fatal).
fn spawn_background_tasks(app: &mut tauri::App, state: app::SharedState) {
    state.set_app_handle(app.handle().clone());

    // UI: Restore window position
    if let Some(main_window) = app.get_webview_window("main") {
        window::position::restore_window_state(&main_window, state.db());
    }

    // Step 15: Web server
    let port = state.server_port();
    state.emit_event(
        events::WEBSERVER_STARTED,
        events::ServerStartedPayload { port },
    );
    let s = state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = server::start_server(s).await {
            tracing::error!("Server failed: {e}");
        }
    });

    // Step 16: Token auto-refresh
    let s = state.clone();
    tauri::async_runtime::spawn(async move { background::token_refresh_loop(s).await });

    // Step 13: EventSub
    let s = state.clone();
    tauri::async_runtime::spawn(async move { eventsub_handler::run(s).await });

    // Step 10: Printer KeepAlive
    let s = state.clone();
    tauri::async_runtime::spawn(async move { background::printer_keepalive_loop(s).await });

    // Print queue worker
    let s = state.clone();
    tauri::async_runtime::spawn(async move { services::print_queue::start_worker(s).await });

    // Step 14: Notification
    let s = state.clone();
    tauri::async_runtime::spawn(async move { notification::initialize(&s).await });
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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state.clone())
        .setup(move |app| {
            spawn_background_tasks(app, shared_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_port, get_version])
        .on_window_event(move |win, event| {
            use tauri::WindowEvent;
            match event {
                WindowEvent::Moved(_) => {
                    window::position::on_window_moved(win, &db_for_window);
                }
                WindowEvent::Resized(_) => {
                    window::position::on_window_resized(win, &db_for_window);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
