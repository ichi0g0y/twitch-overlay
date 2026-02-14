//! Bits leaderboard helpers for clock printing.

use image_processor::clock::BitsLeaderEntry;
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;

use crate::app::SharedState;

/// Load monthly bits leaderboard entries for clock stats.
pub async fn load_month_bits_leaders(
    state: &SharedState,
    max_count: u32,
) -> Result<Vec<BitsLeaderEntry>, String> {
    let (client_id, client_secret, server_port) = {
        let config = state.config().await;
        (
            config.client_id.clone(),
            config.client_secret.clone(),
            config.server_port,
        )
    };
    if client_id.is_empty() || client_secret.is_empty() {
        return Ok(Vec::new());
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        Ok(None) => return Ok(Vec::new()),
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
                tracing::warn!("Failed to save refreshed token for bits leaderboard: {e}");
            }
            refreshed
        }
        Ok(None) => current_token,
        Err(e) => return Err(format!("failed to get usable token: {e}")),
    };

    let client = TwitchApiClient::new(client_id);
    let entries = client
        .get_bits_leaderboard(&usable_token, "month", max_count)
        .await
        .map_err(|e| format!("failed to fetch bits leaderboard: {e}"))?;

    Ok(entries
        .into_iter()
        .map(|entry| BitsLeaderEntry {
            rank: entry.rank,
            user_name: if entry.user_name.is_empty() {
                entry.user_login
            } else {
                entry.user_name
            },
            score: entry.score,
            avatar: None,
        })
        .collect())
}
