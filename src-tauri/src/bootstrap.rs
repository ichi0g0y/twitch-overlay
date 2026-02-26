use std::path::PathBuf;

use overlay_db::Database;
use tauri::Manager;
use word_filter::seed_default_words;

use crate::app;
use crate::background;
use crate::config::{AppConfig, SettingsManager};
use crate::events;
use crate::eventsub_handler;
use crate::notification;
use crate::server;
use crate::services;
use crate::window;

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
    migrate_legacy_overlay_settings(&sm);
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

/// Steps 10-16: Spawn all background tasks (non-fatal).
pub fn spawn_background_tasks(app: &mut tauri::App, state: app::SharedState) {
    state.set_app_handle(app.handle().clone());

    // UI: Restore window position
    // WKWebView autoplay policy is configured by wry when the webview is created.
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
        if let Err(e) = server::start_server(s.clone()).await {
            tracing::error!("Server failed: {e}");
            s.emit_event(
                events::WEBSERVER_ERROR,
                events::ErrorPayload {
                    message: e.to_string(),
                },
            );
        }
    });

    // Step 16: Token auto-refresh
    let s = state.clone();
    tauri::async_runtime::spawn(async move { background::token_refresh_loop(s).await });

    // Step 11: Stream status sync (startup + periodic)
    let s = state.clone();
    tauri::async_runtime::spawn(async move { background::stream_status_sync_loop(s).await });

    // Step 13: EventSub
    let s = state.clone();
    tauri::async_runtime::spawn(async move { eventsub_handler::run(s).await });

    // Step 10: Printer KeepAlive
    let s = state.clone();
    tauri::async_runtime::spawn(async move { background::printer_keepalive_loop(s).await });

    // Print queue worker
    let s = state.clone();
    tauri::async_runtime::spawn(async move { services::print_queue::start_worker(s).await });

    // Clock routine (hourly print)
    let s = state.clone();
    tauri::async_runtime::spawn(async move { services::clock_print::clock_routine_loop(s).await });

    // Step 14: Notification
    let s = state.clone();
    tauri::async_runtime::spawn(async move { notification::initialize(&s).await });
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

/// Migrate overlay clock detail flags from legacy OVERLAY_* keys.
fn migrate_legacy_overlay_settings(sm: &SettingsManager) {
    let key_pairs = [
        ("OVERLAY_LOCATION_ENABLED", "LOCATION_ENABLED"),
        ("OVERLAY_DATE_ENABLED", "DATE_ENABLED"),
        ("OVERLAY_TIME_ENABLED", "TIME_ENABLED"),
    ];

    for (legacy_key, new_key) in key_pairs {
        let has_new = match sm.db().get_setting(new_key) {
            Ok(v) => v.is_some(),
            Err(e) => {
                tracing::warn!("Failed to read setting {new_key}: {e}");
                continue;
            }
        };
        if has_new {
            continue;
        }

        let legacy_value = match sm.db().get_setting(legacy_key) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("Failed to read legacy setting {legacy_key}: {e}");
                continue;
            }
        };
        if let Some(value) = legacy_value {
            tracing::info!("Migrating {legacy_key} -> {new_key}");
            if let Err(e) = sm.set_setting(new_key, &value) {
                tracing::warn!("Failed to migrate {legacy_key} -> {new_key}: {e}");
            }
        }
    }
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
