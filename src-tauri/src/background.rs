//! Background task loops: token refresh, printer keepalive, stream status sync.

use std::time::Duration;

use serde_json::json;
use tokio::time::sleep;
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;

use crate::app::SharedState;
use crate::events;
use crate::services::printer;

/// Periodic BLE printer KeepAlive reconnection.
pub async fn printer_keepalive_loop(state: SharedState) {
    // Wait for initial startup
    sleep(Duration::from_secs(30)).await;

    loop {
        let (enabled, interval, printer_type, address) = {
            let config = state.config().await;
            (
                config.keep_alive_enabled,
                config.keep_alive_interval.max(10) as u64,
                config.printer_type.clone(),
                config.printer_address.clone(),
            )
        };

        if !enabled || printer_type != "bluetooth" || address.is_empty() {
            sleep(Duration::from_secs(60)).await;
            continue;
        }

        sleep(Duration::from_secs(interval)).await;

        tracing::debug!("Printer KeepAlive: reconnecting to {address}");
        if let Err(e) = printer::reconnect_bluetooth(&address).await {
            tracing::warn!("Printer KeepAlive failed: {e}");
            printer::mark_error(e).await;
        } else {
            printer::mark_connected("bluetooth", &address).await;
            tracing::debug!("Printer KeepAlive: reconnected successfully");
        }
    }
}

/// Periodically sync stream status from Twitch API.
///
/// This mirrors the legacy startup behavior where stream status is checked
/// even before EventSub stream online/offline events arrive.
pub async fn stream_status_sync_loop(state: SharedState) {
    // Wait for initial startup
    sleep(Duration::from_secs(5)).await;

    loop {
        if let Err(e) = sync_stream_status_once(&state).await {
            tracing::debug!("Stream status sync skipped/failed: {e}");
        }
        sleep(Duration::from_secs(60)).await;
    }
}

async fn sync_stream_status_once(state: &SharedState) -> Result<(), String> {
    let (client_id, client_secret, twitch_user_id, server_port) = {
        let config = state.config().await;
        (
            config.client_id.clone(),
            config.client_secret.clone(),
            config.twitch_user_id.clone(),
            config.server_port,
        )
    };

    if client_id.is_empty() || client_secret.is_empty() || twitch_user_id.is_empty() {
        return Ok(());
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        Ok(None) => return Ok(()),
        Err(e) => return Err(format!("failed to load token from DB: {e}")),
    };

    let current_token = Token {
        access_token: db_token.access_token.clone(),
        refresh_token: db_token.refresh_token.clone(),
        scope: db_token.scope.clone(),
        expires_at: db_token.expires_at,
    };

    let redirect_uri = format!("http://127.0.0.1:{server_port}/callback");
    let auth = TwitchAuth::new(client_id.clone(), client_secret, redirect_uri);
    let usable_token = match auth.get_or_refresh_token(&current_token).await {
        Ok(Some(refreshed)) => {
            let db_tok = overlay_db::tokens::Token {
                access_token: refreshed.access_token.clone(),
                refresh_token: refreshed.refresh_token.clone(),
                scope: refreshed.scope.clone(),
                expires_at: refreshed.expires_at,
            };
            if let Err(e) = state.db().save_token(&db_tok) {
                tracing::warn!("Failed to persist refreshed token during stream sync: {e}");
            }
            refreshed
        }
        Ok(None) => current_token,
        Err(e) => return Err(format!("failed to get usable token: {e}")),
    };

    let client = TwitchApiClient::new(client_id);
    let status = client
        .get_stream_info(&usable_token, &twitch_user_id)
        .await
        .map_err(|e| format!("failed to fetch stream status: {e}"))?;

    apply_stream_status(state, status.is_live, status.viewer_count).await;
    Ok(())
}

async fn apply_stream_status(state: &SharedState, is_live: bool, viewer_count: u64) {
    let previous = state.stream_live().await;
    state.set_stream_live(is_live).await;

    if previous == Some(is_live) {
        return;
    }

    let payload = json!({
        "is_live": is_live,
        "viewer_count": viewer_count,
        "source": "stream_status_poll",
    });

    let _ = state.ws_sender().send(
        json!({
            "type": "stream_status_changed",
            "data": payload,
        })
        .to_string(),
    );
    let _ = state.ws_sender().send(
        json!({
            "type": if is_live { "stream_online" } else { "stream_offline" },
            "data": payload,
        })
        .to_string(),
    );
    state.emit_event(
        events::STREAM_STATUS_CHANGED,
        events::StreamStatusPayload { is_live },
    );
}

/// Periodically check and refresh the Twitch OAuth token.
pub async fn token_refresh_loop(state: SharedState) {
    // Wait for initial startup
    sleep(Duration::from_secs(10)).await;

    loop {
        let db_token = match state.db().get_latest_token() {
            Ok(Some(t)) => t,
            _ => {
                sleep(Duration::from_secs(60)).await;
                continue;
            }
        };

        let now = chrono::Utc::now().timestamp();
        let time_until_expiry = db_token.expires_at - now;

        if time_until_expiry <= 0 || time_until_expiry <= 30 * 60 {
            tracing::info!(
                time_until_expiry,
                "Token expiring soon or expired, refreshing"
            );

            let config = state.config().await;
            if config.client_id.is_empty() || config.client_secret.is_empty() {
                sleep(Duration::from_secs(300)).await;
                continue;
            }

            let redirect_uri = format!("http://127.0.0.1:{}/callback", config.server_port);
            let auth = twitch_client::auth::TwitchAuth::new(
                config.client_id.clone(),
                config.client_secret.clone(),
                redirect_uri,
            );
            drop(config);

            match auth.refresh_token(&db_token.refresh_token).await {
                Ok(new_token) => {
                    let db_tok = overlay_db::tokens::Token {
                        access_token: new_token.access_token,
                        refresh_token: new_token.refresh_token,
                        scope: new_token.scope,
                        expires_at: new_token.expires_at,
                    };
                    if let Err(e) = state.db().save_token(&db_tok) {
                        tracing::error!("Failed to save refreshed token: {e}");
                    } else {
                        tracing::info!(
                            expires_at = db_tok.expires_at,
                            "Token auto-refreshed successfully"
                        );
                    }
                }
                Err(e) => {
                    tracing::error!("Token auto-refresh failed: {e}");
                    sleep(Duration::from_secs(300)).await;
                    continue;
                }
            }
        }

        // Sleep until 30 min before expiry, or 1 hour max
        let sleep_secs = if time_until_expiry > 30 * 60 {
            (time_until_expiry - 30 * 60).min(3600) as u64
        } else {
            300
        };
        sleep(Duration::from_secs(sleep_secs)).await;
    }
}
