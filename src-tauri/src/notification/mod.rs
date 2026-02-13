//! Desktop notification system for Twitch events.
//!
//! Supports queue and overwrite display modes, multi-window rendering,
//! and fragment-based content (text, emoji, emote).

pub mod queue;
pub mod types;
pub mod window;

use crate::app::SharedState;
use crate::config::SettingsManager;

/// Initialize the notification system.
pub async fn initialize(state: &SharedState) {
    let sm = SettingsManager::new(state.db().clone());
    let enabled = sm
        .get_setting("NOTIFICATION_ENABLED")
        .unwrap_or_default()
        .eq_ignore_ascii_case("true");

    if !enabled {
        tracing::info!("Notification system disabled");
        return;
    }

    if let Err(e) = window::ensure_window(state) {
        tracing::warn!("Failed to initialize notification window: {e}");
    }

    queue::start_worker(state.clone()).await;
    tracing::info!("Notification system initialized");
}
