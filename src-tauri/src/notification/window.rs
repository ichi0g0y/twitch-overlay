//! Notification window management.
//!
//! Creates and manages the notification popup window using Tauri's
//! WebviewWindow API. The window is transparent, always-on-top,
//! and positioned based on saved settings.

use overlay_db::Database;
use serde::{Deserialize, Serialize};

use crate::config::SettingsManager;

const SETTING_NOTIF_X: &str = "NOTIFICATION_POSITION_X";
const SETTING_NOTIF_Y: &str = "NOTIFICATION_POSITION_Y";
const SETTING_NOTIF_SCREEN: &str = "NOTIFICATION_SCREEN_INDEX";

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

/// Load notification window position from DB.
pub fn load_position(db: &Database) -> NotificationPosition {
    let sm = SettingsManager::new(db.clone());

    let x: i32 = sm
        .get_setting(SETTING_NOTIF_X)
        .unwrap_or_default()
        .parse()
        .unwrap_or(-1);
    let y: i32 = sm
        .get_setting(SETTING_NOTIF_Y)
        .unwrap_or_default()
        .parse()
        .unwrap_or(-1);
    let screen_index: usize = sm
        .get_setting(SETTING_NOTIF_SCREEN)
        .unwrap_or_default()
        .parse()
        .unwrap_or(0);

    NotificationPosition { x, y, screen_index }
}

/// Save notification window position to DB.
pub fn save_position(db: &Database, pos: &NotificationPosition) {
    let sm = SettingsManager::new(db.clone());
    let _ = sm.set_setting(SETTING_NOTIF_X, &pos.x.to_string());
    let _ = sm.set_setting(SETTING_NOTIF_Y, &pos.y.to_string());
    let _ = sm.set_setting(SETTING_NOTIF_SCREEN, &pos.screen_index.to_string());
}

/// Reset notification window position to defaults.
pub fn reset_position(db: &Database) {
    save_position(db, &NotificationPosition::default());
}
