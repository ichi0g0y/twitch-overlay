//! EventSub event handler — dispatches incoming Twitch events.
//!
//! Waits for a valid token, connects to EventSub, and processes events
//! by broadcasting to WebSocket clients and persisting to DB as needed.

use std::time::Duration;

use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio::time::sleep;
use twitch_client::eventsub::{EventSubClient, EventSubConfig, EventSubEvent};

use crate::app::SharedState;

/// Start the EventSub handler loop.
///
/// Waits until a valid OAuth token is available, then connects
/// to EventSub and processes events. Reconnects automatically
/// if the token changes or the connection drops.
pub async fn run(state: SharedState) {
    // Wait for startup to complete
    sleep(Duration::from_secs(15)).await;

    loop {
        // Wait for a valid token
        let (client_id, access_token, broadcaster_id) = loop {
            let config = state.config().await;
            let cid = config.client_id.clone();
            let bid = config.twitch_user_id.clone();
            drop(config);

            if cid.is_empty() || bid.is_empty() {
                sleep(Duration::from_secs(30)).await;
                continue;
            }

            match state.db().get_latest_token() {
                Ok(Some(t)) if !t.access_token.is_empty() => {
                    break (cid, t.access_token, bid);
                }
                _ => {
                    sleep(Duration::from_secs(30)).await;
                    continue;
                }
            }
        };

        tracing::info!("Starting EventSub connection");

        let config = EventSubConfig::with_all_events(client_id, access_token, broadcaster_id);

        match EventSubClient::connect(config).await {
            Ok((event_rx, _shutdown_tx)) => {
                process_events(&state, event_rx).await;
                tracing::warn!("EventSub event stream ended, will reconnect");
            }
            Err(e) => {
                tracing::error!("EventSub connection failed: {e}");
            }
        }

        sleep(Duration::from_secs(5)).await;
    }
}

/// Process events from the EventSub channel until it closes.
async fn process_events(state: &SharedState, mut events: mpsc::Receiver<EventSubEvent>) {
    while let Some(event) = events.recv().await {
        // Always broadcast to WS clients
        let ws_msg = json!({
            "type": "eventsub_event",
            "data": {
                "event_type": &event.event_type,
                "payload": &event.payload,
            }
        });
        let _ = state.ws_sender().send(ws_msg.to_string());

        // Type-specific handling
        match event.event_type.as_str() {
            "channel.chat.message" => handle_chat_message(state, &event.payload),
            "stream.online" => handle_stream_online(state),
            "stream.offline" => handle_stream_offline(state),
            "channel.channel_points_custom_reward_redemption.add" => {
                handle_reward_redemption(state, &event.payload);
            }
            other => {
                tracing::debug!(event_type = other, "EventSub event received");
            }
        }
    }
}

/// Save chat message to DB and broadcast.
fn handle_chat_message(state: &SharedState, payload: &Value) {
    let message_id = payload
        .get("message_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let user_id = payload
        .get("chatter_user_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let username = payload
        .get("chatter_user_login")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let message_text = payload
        .get("message")
        .and_then(|m| m.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or_default();
    let fragments = payload
        .get("message")
        .and_then(|m| m.get("fragments"))
        .cloned()
        .unwrap_or(Value::Array(vec![]));

    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.to_string(),
        user_id: user_id.to_string(),
        username: username.to_string(),
        message: message_text.to_string(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at: chrono::Utc::now().timestamp(),
    };

    if let Err(e) = state.db().add_chat_message(&msg) {
        tracing::warn!("Failed to save chat message: {e}");
    }
}

/// Broadcast stream online status.
fn handle_stream_online(state: &SharedState) {
    tracing::info!("Stream went online");
    let msg = json!({ "type": "stream_status_changed", "data": { "is_live": true } });
    let _ = state.ws_sender().send(msg.to_string());
}

/// Broadcast stream offline status.
fn handle_stream_offline(state: &SharedState) {
    tracing::info!("Stream went offline");
    let msg = json!({ "type": "stream_status_changed", "data": { "is_live": false } });
    let _ = state.ws_sender().send(msg.to_string());
}

/// Handle channel point reward redemption — broadcast with reward details.
fn handle_reward_redemption(state: &SharedState, payload: &Value) {
    let reward_id = payload
        .get("reward")
        .and_then(|r| r.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let reward_title = payload
        .get("reward")
        .and_then(|r| r.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let user = payload
        .get("user_login")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    tracing::info!(
        reward_id,
        reward_title,
        user,
        "Channel point reward redeemed"
    );

    // Increment reward count in DB
    if !reward_id.is_empty() {
        let display_name = payload
            .get("user_name")
            .and_then(|v| v.as_str())
            .unwrap_or(user);
        if let Err(e) = state.db().increment_reward_count(reward_id, display_name) {
            tracing::warn!("Failed to increment reward count: {e}");
        }
    }

    let msg = json!({
        "type": "channel_points",
        "data": payload,
    });
    let _ = state.ws_sender().send(msg.to_string());
}
