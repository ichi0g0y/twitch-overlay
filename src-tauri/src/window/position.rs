//! Window position persistence and restoration.
//!
//! Stores window state in the DB via SettingsManager, restores on startup.

use overlay_db::Database;
use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

use crate::config::SettingsManager;
use crate::window::monitor;

const SETTING_WINDOW_STATE: &str = "WINDOW_STATE_JSON";
const SETTING_SCREEN_HASH: &str = "WINDOW_SCREEN_CONFIG_HASH";

/// Persisted window state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_fullscreen: bool,
}

/// Save window position and size to DB.
pub fn save_window_state(db: &Database, state: &WindowState) {
    let sm = SettingsManager::new(db.clone());
    if let Ok(json) = serde_json::to_string(state) {
        if let Err(e) = sm.set_setting(SETTING_WINDOW_STATE, &json) {
            tracing::warn!("Failed to save window state: {e}");
        }
    }
}

/// Load window state from DB.
pub fn load_window_state(db: &Database) -> Option<WindowState> {
    let sm = SettingsManager::new(db.clone());
    let json = sm.get_setting(SETTING_WINDOW_STATE).unwrap_or_default();
    if json.is_empty() {
        return None;
    }
    serde_json::from_str(&json).ok()
}

/// Restore window position from DB. Resets if monitor config changed.
pub fn restore_window_state(window: &WebviewWindow, db: &Database) {
    let app = window.app_handle();
    let screens = monitor::get_all_screens(app);
    let current_hash = monitor::generate_screen_config_hash(&screens);

    let sm = SettingsManager::new(db.clone());
    let saved_hash = sm.get_setting(SETTING_SCREEN_HASH).unwrap_or_default();

    // If monitor config changed, don't restore (use default position)
    if !saved_hash.is_empty() && saved_hash != current_hash {
        tracing::info!("Monitor config changed, resetting window position");
        if let Err(e) = sm.set_setting(SETTING_SCREEN_HASH, &current_hash) {
            tracing::warn!("Failed to save screen hash: {e}");
        }
        return;
    }

    // Save current hash
    if let Err(e) = sm.set_setting(SETTING_SCREEN_HASH, &current_hash) {
        tracing::warn!("Failed to save screen hash: {e}");
    }

    let Some(state) = load_window_state(db) else {
        return;
    };

    // Verify the saved position is on a visible screen
    let on_screen =
        monitor::find_screen_containing(&screens, state.x, state.y, state.width, state.height);

    if on_screen.is_none() {
        tracing::info!("Saved window position is off-screen, using default");
        return;
    }

    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));

    if state.is_fullscreen {
        let _ = window.set_fullscreen(true);
    }

    tracing::info!(
        x = state.x,
        y = state.y,
        w = state.width,
        h = state.height,
        "Restored window position"
    );
}

/// Handle window moved event — save new position.
pub fn on_window_moved(window: &Window, db: &Database) {
    let Some((x, y)) = monitor::get_window_position(window) else {
        return;
    };
    let (width, height) = monitor::get_window_size(window).unwrap_or((800, 600));
    let is_fullscreen = window.is_fullscreen().unwrap_or(false);

    save_window_state(
        db,
        &WindowState {
            x,
            y,
            width,
            height,
            is_fullscreen,
        },
    );
}

/// Handle window resized event — save new size.
pub fn on_window_resized(window: &Window, db: &Database) {
    on_window_moved(window, db);
}
