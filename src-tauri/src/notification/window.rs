//! Notification window management.
//!
//! Creates and controls the dedicated notification `WebviewWindow`,
//! restores its saved position, and persists changes on move/resize.

use overlay_db::Database;
use serde::{Deserialize, Serialize};
use tauri::{
    Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::app::SharedState;
use crate::config::SettingsManager;
use crate::window::monitor;

mod settings;

use settings::{load_interaction_settings, load_saved_coordinate};

pub const NOTIFICATION_WINDOW_LABEL: &str = "twitch-chat-notification";

const SETTING_X: &str = "NOTIFICATION_WINDOW_X";
const SETTING_Y: &str = "NOTIFICATION_WINDOW_Y";
const SETTING_ABS_X: &str = "NOTIFICATION_WINDOW_ABSOLUTE_X";
const SETTING_ABS_Y: &str = "NOTIFICATION_WINDOW_ABSOLUTE_Y";
const SETTING_WIDTH: &str = "NOTIFICATION_WINDOW_WIDTH";
const SETTING_HEIGHT: &str = "NOTIFICATION_WINDOW_HEIGHT";
const SETTING_SCREEN_INDEX: &str = "NOTIFICATION_WINDOW_SCREEN_INDEX";
const SETTING_SCREEN_HASH: &str = "NOTIFICATION_WINDOW_SCREEN_HASH";
const SETTING_MOVABLE: &str = "NOTIFICATION_WINDOW_MOVABLE";
const SETTING_RESIZABLE: &str = "NOTIFICATION_WINDOW_RESIZABLE";

const DEFAULT_WIDTH: u32 = 400;
const DEFAULT_HEIGHT: u32 = 150;
const DEFAULT_MARGIN: i32 = 20;

/// Saved notification window position.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPosition {
    pub x: i32,
    pub y: i32,
    pub screen_index: usize,
}

impl Default for NotificationPosition {
    fn default() -> Self {
        Self {
            x: -1,
            y: -1,
            screen_index: 0,
        }
    }
}

/// Ensure the notification window exists. Creates it in hidden state when missing.
pub fn ensure_window(state: &SharedState) -> Result<WebviewWindow, String> {
    let Some(app) = state.app_handle() else {
        return Err("Tauri AppHandle is not initialized".to_string());
    };

    if let Some(existing) = app.get_webview_window(NOTIFICATION_WINDOW_LABEL) {
        apply_interaction_settings(&existing, state.db());
        return Ok(existing);
    }

    let (width, height) = load_size(state.db());
    let (movable, resizable) =
        load_interaction_settings(state.db(), SETTING_MOVABLE, SETTING_RESIZABLE);
    let effective_resizable = movable && resizable;
    let window = WebviewWindowBuilder::new(
        &app,
        NOTIFICATION_WINDOW_LABEL,
        WebviewUrl::App("/notification".into()),
    )
    .title("Twitch Chat")
    .visible(false)
    // Keep window chrome disabled so transparent corners can create a rounded window shape.
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .resizable(effective_resizable)
    .inner_size(width as f64, height as f64)
    .build()
    .map_err(|e| format!("Failed to create notification window: {e}"))?;

    apply_interaction_settings(&window, state.db());
    restore_layout(&window, state.db(), width, height);
    install_event_handlers(&window, state.db().clone());

    tracing::info!("Notification window created");
    Ok(window)
}

/// Show the notification window (creates it if needed).
pub fn show(state: &SharedState) {
    match ensure_window(state) {
        Ok(window) => {
            let _ = window.set_always_on_top(true);
            if let Err(e) = window.show() {
                tracing::warn!("Failed to show notification window: {e}");
            }
        }
        Err(e) => tracing::warn!("Failed to ensure notification window: {e}"),
    }
}

/// Hide the notification window if it exists.
pub fn hide(state: &SharedState) {
    let Some(app) = state.app_handle() else {
        return;
    };
    let Some(window) = app.get_webview_window(NOTIFICATION_WINDOW_LABEL) else {
        return;
    };

    persist_current_layout(&window, state.db());
    if let Err(e) = window.hide() {
        tracing::warn!("Failed to hide notification window: {e}");
    }
}

/// Load notification window position from DB.
pub fn load_position(db: &Database) -> NotificationPosition {
    let sm = SettingsManager::new(db.clone());

    let x = load_saved_coordinate(&sm, SETTING_ABS_X, SETTING_X);
    let y = load_saved_coordinate(&sm, SETTING_ABS_Y, SETTING_Y);
    let screen_index: usize = sm
        .get_setting(SETTING_SCREEN_INDEX)
        .unwrap_or_default()
        .parse()
        .unwrap_or(0);

    NotificationPosition {
        x: x.unwrap_or(-1),
        y: y.unwrap_or(-1),
        screen_index,
    }
}

fn has_saved_coordinates(db: &Database) -> bool {
    let sm = SettingsManager::new(db.clone());
    let x = load_saved_coordinate(&sm, SETTING_ABS_X, SETTING_X);
    let y = load_saved_coordinate(&sm, SETTING_ABS_Y, SETTING_Y);
    x.is_some() && y.is_some()
}

/// Save notification window position to DB.
pub fn save_position(db: &Database, pos: &NotificationPosition) {
    let sm = SettingsManager::new(db.clone());
    let x = pos.x.to_string();
    let y = pos.y.to_string();
    let _ = sm.set_setting(SETTING_X, &x);
    let _ = sm.set_setting(SETTING_Y, &y);
    let _ = sm.set_setting(SETTING_ABS_X, &x);
    let _ = sm.set_setting(SETTING_ABS_Y, &y);
    let _ = sm.set_setting(SETTING_SCREEN_INDEX, &pos.screen_index.to_string());
}

/// Reset notification window position to defaults.
#[allow(dead_code)]
pub fn reset_position(db: &Database) {
    save_position(db, &NotificationPosition::default());
}

fn install_event_handlers(window: &WebviewWindow, db: Database) {
    let tracked = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            persist_current_layout(&tracked, &db);
        }
    });
}

fn persist_current_layout(window: &WebviewWindow, db: &Database) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(outer_size) = window.outer_size() else {
        return;
    };
    let inner_size = window.inner_size().unwrap_or(outer_size);

    let screens = monitor::get_all_screens(&window.app_handle());
    let screen_index = monitor::find_screen_containing(
        &screens,
        pos.x,
        pos.y,
        outer_size.width,
        outer_size.height,
    )
    .unwrap_or(0);
    save_position(
        db,
        &NotificationPosition {
            x: pos.x,
            y: pos.y,
            screen_index,
        },
    );
    // Persist content size so restores remain stable even with window decorations.
    save_size(db, inner_size.width, inner_size.height);

    if !screens.is_empty() {
        let sm = SettingsManager::new(db.clone());
        let hash = monitor::generate_screen_config_hash(&screens);
        let _ = sm.set_setting(SETTING_SCREEN_HASH, &hash);
    }
}

fn restore_layout(window: &WebviewWindow, db: &Database, width: u32, height: u32) {
    let screens = monitor::get_all_screens(&window.app_handle());
    if screens.is_empty() {
        return;
    }

    let saved = load_position(db);
    let has_saved_coordinates = has_saved_coordinates(db);
    let maybe_saved_screen =
        monitor::find_screen_containing(&screens, saved.x, saved.y, width, height);

    let (x, y, screen_index) = if has_saved_coordinates && maybe_saved_screen.is_some() {
        (
            saved.x,
            saved.y,
            maybe_saved_screen.unwrap_or(saved.screen_index),
        )
    } else {
        default_position_for_screen(&screens, saved.screen_index, width, height)
    };

    let _ = window.set_position(PhysicalPosition::new(x, y));
    save_position(db, &NotificationPosition { x, y, screen_index });

    let sm = SettingsManager::new(db.clone());
    let hash = monitor::generate_screen_config_hash(&screens);
    let _ = sm.set_setting(SETTING_SCREEN_HASH, &hash);
}

fn default_position_for_screen(
    screens: &[monitor::ScreenInfo],
    preferred_index: usize,
    width: u32,
    height: u32,
) -> (i32, i32, usize) {
    let index = if preferred_index < screens.len() {
        preferred_index
    } else {
        0
    };
    let s = &screens[index];
    let x = s.x + s.width as i32 - width as i32 - DEFAULT_MARGIN;
    let y = s.y + s.height as i32 - height as i32 - DEFAULT_MARGIN;
    (x, y, index)
}

fn load_size(db: &Database) -> (u32, u32) {
    let sm = SettingsManager::new(db.clone());
    let width = sm
        .get_setting(SETTING_WIDTH)
        .unwrap_or_default()
        .parse::<u32>()
        .ok()
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_WIDTH);
    let height = sm
        .get_setting(SETTING_HEIGHT)
        .unwrap_or_default()
        .parse::<u32>()
        .ok()
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_HEIGHT);
    (width, height)
}

fn apply_interaction_settings(window: &WebviewWindow, db: &Database) {
    let (movable, resizable) = load_interaction_settings(db, SETTING_MOVABLE, SETTING_RESIZABLE);
    let effective_resizable = movable && resizable;
    let _ = window.set_always_on_top(true);
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(false);
    let _ = window.set_resizable(effective_resizable);
}

fn save_size(db: &Database, width: u32, height: u32) {
    let sm = SettingsManager::new(db.clone());
    let _ = sm.set_setting(SETTING_WIDTH, &width.to_string());
    let _ = sm.set_setting(SETTING_HEIGHT, &height.to_string());
}
