//! Background task loops: token refresh, printer keepalive.

use std::time::Duration;

use tokio::time::sleep;

use crate::app::SharedState;
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
