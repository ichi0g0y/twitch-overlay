//! EventSub event handler — dispatches incoming Twitch events.
//!
//! Waits for a valid token, connects to EventSub, and processes events
//! by broadcasting to WebSocket clients and persisting to DB as needed.

use std::time::Duration;

use serde_json::json;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use twitch_client::eventsub::{EventSubClient, EventSubConfig, EventSubEvent};

use crate::app::SharedState;
use crate::events;

async fn sleep_or_cancel(token: &CancellationToken, duration: Duration) -> bool {
    tokio::select! {
        _ = token.cancelled() => true,
        _ = sleep(duration) => false,
    }
}

/// Start the EventSub handler loop.
///
/// Waits until a valid OAuth token is available, then connects
/// to EventSub and processes events. Reconnects automatically
/// if the token changes or the connection drops.
pub async fn run(state: SharedState) {
    let shutdown_token = state.shutdown_token().clone();

    // Wait for startup to complete
    if sleep_or_cancel(&shutdown_token, Duration::from_secs(15)).await {
        tracing::info!("EventSub loop stopped (shutdown)");
        return;
    }

    loop {
        // Wait for a valid token
        let (client_id, access_token, broadcaster_id) = loop {
            let config = state.config().await;
            let cid = config.client_id.clone();
            let bid = config.twitch_user_id.clone();
            drop(config);

            if cid.is_empty() || bid.is_empty() {
                if sleep_or_cancel(&shutdown_token, Duration::from_secs(30)).await {
                    tracing::info!("EventSub loop stopped (shutdown)");
                    return;
                }
                continue;
            }

            match state.db().get_latest_token() {
                Ok(Some(t)) if !t.access_token.is_empty() => {
                    break (cid, t.access_token, bid);
                }
                _ => {
                    if sleep_or_cancel(&shutdown_token, Duration::from_secs(30)).await {
                        tracing::info!("EventSub loop stopped (shutdown)");
                        return;
                    }
                    continue;
                }
            }
        };

        tracing::info!("Starting EventSub connection");

        let config = EventSubConfig::with_all_events(client_id, access_token, broadcaster_id);

        match EventSubClient::connect(config).await {
            Ok((event_rx, shutdown_tx)) => {
                state.set_eventsub_shutdown(shutdown_tx).await;
                process_events(&state, event_rx, &shutdown_token).await;
                tracing::warn!("EventSub event stream ended, will reconnect");
            }
            Err(e) => {
                tracing::error!("EventSub connection failed: {e}");
            }
        }

        if sleep_or_cancel(&shutdown_token, Duration::from_secs(5)).await {
            tracing::info!("EventSub loop stopped (shutdown)");
            return;
        }
    }
}

/// Process events from the EventSub channel until it closes.
async fn process_events(
    state: &SharedState,
    mut events: mpsc::Receiver<EventSubEvent>,
    shutdown_token: &CancellationToken,
) {
    loop {
        let event = tokio::select! {
            _ = shutdown_token.cancelled() => return,
            event = events.recv() => event,
        };
        let Some(event) = event else {
            return;
        };

        // Always broadcast to WS clients
        let payload = json!({
            "type": "eventsub_event",
            "data": {
                "event_type": &event.event_type,
                "payload": &event.payload,
            }
        });
        let _ = state.ws_sender().send(payload.to_string());
        state.emit_event(events::EVENTSUB_EVENT, payload);
        crate::eventsub_events::handle_event(state, &event.event_type, &event.payload).await;
    }
}
