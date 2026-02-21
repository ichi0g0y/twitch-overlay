//! Notification queue and worker.
//!
//! Processes notifications sequentially (queue mode) or
//! overwrites the current notification (overwrite mode).

use std::sync::LazyLock;
use std::time::Duration;

use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};
use tokio::time::sleep;

use crate::app::SharedState;
use crate::config::SettingsManager;

use super::types::{ChatNotification, DisplayMode, FragmentInfo};
use super::window;

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

/// Close the queue sender to stop the worker loop.
pub async fn close() {
    let mut slot = NOTIF_TX.write().await;
    *slot = None;
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
                loop {
                    match tokio::time::timeout(Duration::from_secs(duration), rx.recv()).await {
                        Ok(Some(newer)) => {
                            show_notification(&state, &newer);
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
        .get_setting("NOTIFICATION_DISPLAY_DURATION")
        .unwrap_or_default()
        .parse()
        .unwrap_or(DEFAULT_DURATION_SECS);

    (display_mode, duration.max(1))
}

/// Send notification data to the frontend via Tauri emit + WS broadcast.
fn show_notification(state: &SharedState, notif: &ChatNotification) {
    window::show(state);

    let legacy_data = to_legacy_notification_payload(state, notif);
    let legacy_ws = json!({
        "type": "chat-notification",
        "data": legacy_data,
    });
    let _ = state.ws_sender().send(legacy_ws.to_string());
    state.emit_event("chat-notification", legacy_data);

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
    window::hide(state);

    let legacy_ws = json!({
        "type": "chat-notification-hide",
        "data": null,
    });
    let _ = state.ws_sender().send(legacy_ws.to_string());
    state.emit_event("chat-notification-hide", json!({ "visible": false }));

    let payload = json!({
        "type": "chat_notification",
        "data": null,
        "visible": false,
    });

    state.emit_event("chat_notification_hide", payload.clone());
    let _ = state.ws_sender().send(payload.to_string());
}

fn read_font_size(state: &SharedState) -> u32 {
    let sm = SettingsManager::new(state.db().clone());
    let parsed = sm
        .get_setting("NOTIFICATION_FONT_SIZE")
        .unwrap_or_default()
        .parse::<u32>()
        .unwrap_or(14);
    parsed.clamp(10, 48)
}

fn to_legacy_notification_payload(state: &SharedState, notif: &ChatNotification) -> Value {
    let fragments = notif
        .fragments
        .iter()
        .map(fragment_to_legacy)
        .collect::<Vec<_>>();

    json!({
        "username": notif.username,
        "message": notif.message,
        "fragments": fragments,
        "fontSize": read_font_size(state),
        "avatarUrl": notif.avatar_url,
    })
}

fn fragment_to_legacy(fragment: &FragmentInfo) -> Value {
    match fragment {
        FragmentInfo::Text(text) | FragmentInfo::Emoji(text) => {
            json!({
                "type": "text",
                "text": text,
            })
        }
        FragmentInfo::Emote { id, url } => {
            json!({
                "type": "emote",
                "text": "",
                "emoteId": id,
                "emoteUrl": url,
            })
        }
    }
}
