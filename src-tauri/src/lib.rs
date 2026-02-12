mod app;
mod config;
mod commands;
mod server;
mod services;

use std::path::PathBuf;

use overlay_db::Database;
use tracing_subscriber::EnvFilter;

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
/// Priority: TWITCH_OVERLAY_DATA_DIR env var > ~/.twitch-overlay
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

/// Initialize DB, migrate settings, load config.
fn init_config() -> Result<(Database, AppConfig, PathBuf), anyhow::Error> {
    load_dotenv();

    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;
    let db_path = dir.join("local.db");

    tracing::info!("Opening database at {}", db_path.display());
    let db = Database::open(&db_path)?;

    let sm = SettingsManager::new(db.clone());

    // Migrate settings from environment variables (one-time)
    if let Err(e) = sm.migrate_from_env() {
        tracing::error!("Failed to migrate from env: {e}");
    }

    // Initialize default settings
    sm.initialize_defaults()?;

    // Load runtime config
    let config = AppConfig::load(&sm)?;

    // Check feature status and log warnings
    if let Ok(status) = sm.check_feature_status() {
        if !status.missing_settings.is_empty() {
            tracing::warn!(
                "Missing settings: {:?}, warnings: {:?}",
                status.missing_settings,
                status.warnings
            );
        }
    }

    // Seed default word-filter words
    if let Err(e) = seed_default_words(&db) {
        tracing::error!("Failed to seed word-filter defaults: {e}");
    }

    tracing::info!("Settings loaded (port={})", config.server_port);
    Ok((db, config, dir))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let (db, config, dir) = init_config().expect("Failed to initialize configuration");
    let shared_state = app::SharedState::new(db, config, dir);
    let state_for_server = shared_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state)
        .setup(move |_app| {
            let state = state_for_server;
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start_server(state).await {
                    tracing::error!("Server failed: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            get_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
