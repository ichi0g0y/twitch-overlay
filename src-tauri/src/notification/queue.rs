//! Notification queue and worker.
//!
//! Processes notifications sequentially (queue mode) or
//! overwrites the current notification (overwrite mode).

use std::sync::LazyLock;
use std::time::Duration;

use serde_json::json;
use tokio::sync::{RwLock, mpsc};
use tokio::time::sleep;

use crate::app::SharedState;
use crate::config::SettingsManager;

use super::types::{ChatNotification, DisplayMode};

const QUEUE_CAPACITY: usize = 100;
const DEFAULT_DURATION_SECS: u64 = 5;

static NOTIF_TX: LazyLock<RwLock<Option<mpsc::Sender<ChatNotification>>>> =
    LazyLock::new(|| RwLock::new(None));

/// Start the notification queue worker.
pub async fn start_worker(state: SharedState) {
    let (tx, rx) = mpsc::channel::<ChatNotification>(QUEUE_CAPACITY);
    {
        let mut slot = NOTIF_TX.write().await;
        *slot = Some(tx);
    }

    tokio::spawn(worker_loop(state, rx));
    tracing::info!("Notification queue worker started");
}

/// Enqueue a notification for display.
pub async fn enqueue(notification: ChatNotification) -> Result<(), String> {
    let tx_guard = NOTIF_TX.read().await;
    let tx = tx_guard
        .as_ref()
        .ok_or_else(|| "Notification queue not initialized".to_string())?;

    tx.try_send(notification)
        .map_err(|e| format!("Notification queue full or closed: {e}"))?;

    Ok(())
}

/// Worker loop — processes notifications based on display mode.
async fn worker_loop(state: SharedState, mut rx: mpsc::Receiver<ChatNotification>) {
    while let Some(notif) = rx.recv().await {
        let (display_mode, duration) = read_settings(&state);

        match display_mode {
            DisplayMode::Queue => {
                show_notification(&state, &notif);
                sleep(Duration::from_secs(duration)).await;
                hide_notification(&state);
                // Small gap between notifications
                sleep(Duration::from_millis(200)).await;
            }
            DisplayMode::Overwrite => {
                show_notification(&state, &notif);
                // In overwrite mode, drain any pending notifications
                // and show only the latest, resetting the timer
                let mut latest = notif;
                loop {
                    match tokio::time::timeout(Duration::from_secs(duration), rx.recv()).await {
                        Ok(Some(newer)) => {
                            latest = newer;
                            show_notification(&state, &latest);
                            // Timer resets by continuing the loop
                        }
                        _ => {
                            // Timeout or channel closed
                            break;
                        }
                    }
                }
                hide_notification(&state);
            }
        }
    }

    tracing::info!("Notification queue worker stopped");
}

/// Read notification settings from DB.
fn read_settings(state: &SharedState) -> (DisplayMode, u64) {
    let sm = SettingsManager::new(state.db().clone());

    let mode = sm
        .get_setting("NOTIFICATION_DISPLAY_MODE")
        .unwrap_or_default();
    let display_mode = DisplayMode::from_str_setting(&mode);

    let duration: u64 = sm
        .get_setting("NOTIFICATION_DURATION")
        .unwrap_or_default()
        .parse()
        .unwrap_or(DEFAULT_DURATION_SECS);

    (display_mode, duration.max(1))
}

/// Send notification data to the frontend via Tauri emit + WS broadcast.
fn show_notification(state: &SharedState, notif: &ChatNotification) {
    let payload = json!({
        "type": "chat_notification",
        "data": notif,
        "visible": true,
    });

    // Emit to Tauri frontend windows
    state.emit_event("chat_notification", payload.clone());

    // Broadcast to WebSocket clients (overlay)
    let _ = state.ws_sender().send(payload.to_string());
}

/// Hide the notification window.
fn hide_notification(state: &SharedState) {
    let payload = json!({
        "type": "chat_notification",
        "data": null,
        "visible": false,
    });

    state.emit_event("chat_notification_hide", payload.clone());
    let _ = state.ws_sender().send(payload.to_string());
}
