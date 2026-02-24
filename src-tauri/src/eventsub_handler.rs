//! EventSub event handler — dispatches incoming Twitch events.
//!
//! Waits for a valid token, connects to EventSub, and processes events
//! by broadcasting to WebSocket clients and persisting to DB as needed.

use std::time::Duration;

use serde_json::json;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use twitch_client::Token;
use twitch_client::auth::TwitchAuth;
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
            let csecret = config.client_secret.clone();
            let bid = config.twitch_user_id.clone();
            let server_port = config.server_port;
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
                    let current_token = Token {
                        access_token: t.access_token.clone(),
                        refresh_token: t.refresh_token.clone(),
                        scope: t.scope.clone(),
                        expires_at: t.expires_at,
                    };

                    let usable_token = if csecret.trim().is_empty() {
                        current_token
                    } else {
                        let redirect_uri = format!("http://localhost:{server_port}/callback");
                        let auth = TwitchAuth::new(cid.clone(), csecret, redirect_uri);
                        match auth.get_or_refresh_token(&current_token).await {
                            Ok(Some(refreshed)) => {
                                let db_tok = overlay_db::tokens::Token {
                                    access_token: refreshed.access_token.clone(),
                                    refresh_token: refreshed.refresh_token.clone(),
                                    scope: refreshed.scope.clone(),
                                    expires_at: refreshed.expires_at,
                                };
                                if let Err(e) = state.db().save_token(&db_tok) {
                                    tracing::warn!(
                                        "Failed to save refreshed token for EventSub reconnect: {e}"
                                    );
                                }
                                tracing::info!("EventSub token refreshed before (re)connect");
                                refreshed
                            }
                            Ok(None) => current_token,
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to refresh EventSub token before reconnect: {e}"
                                );
                                if sleep_or_cancel(&shutdown_token, Duration::from_secs(30)).await {
                                    tracing::info!("EventSub loop stopped (shutdown)");
                                    return;
                                }
                                continue;
                            }
                        }
                    };

                    break (cid, usable_token.access_token, bid);
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
