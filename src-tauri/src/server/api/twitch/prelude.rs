
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Redirect};
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::Mutex;
use uuid::Uuid;

use overlay_db::broadcast_cache::BroadcastCacheEntry;
use twitch_client::TwitchError;
use twitch_client::api::{
    Chatter, CreateRewardRequest, FollowedChannel, RaidInfo, StreamInfo, TwitchApiClient,
    TwitchUser, UpdateRewardRequest,
};
use twitch_client::auth::TwitchAuth;

use crate::app::SharedState;
use crate::events;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;
static TOKEN_REFRESH_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
const FOLLOWED_CHANNELS_PAGE_SIZE: u32 = 100;
const FOLLOWED_CHANNELS_SCAN_LIMIT: usize = 1000;
const FOLLOWED_CHANNELS_LOOKUP_CHUNK_SIZE: usize = 100;
const CHATTERS_PAGE_SIZE: u32 = 1000;
const CHATTERS_SCAN_LIMIT: usize = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_twitch_token(db: &overlay_db::tokens::Token) -> twitch_client::Token {
    twitch_client::Token {
        access_token: db.access_token.clone(),
        refresh_token: db.refresh_token.clone(),
        scope: db.scope.clone(),
        expires_at: db.expires_at,
    }
}

fn to_db_token(t: &twitch_client::Token) -> overlay_db::tokens::Token {
    overlay_db::tokens::Token {
        access_token: t.access_token.clone(),
        refresh_token: t.refresh_token.clone(),
        scope: t.scope.clone(),
        expires_at: t.expires_at,
    }
}

fn map_twitch_error(err: TwitchError) -> (axum::http::StatusCode, Json<Value>) {
    match err {
        TwitchError::AuthRequired => err_json(401, "Authentication required"),
        TwitchError::TokenRefreshFailed(_) => {
            err_json(401, "Token refresh failed, please re-authenticate")
        }
        TwitchError::ApiError { status, message } => err_json(status, &message),
        other => err_json(500, &other.to_string()),
    }
}

async fn create_auth(
    state: &SharedState,
) -> Result<TwitchAuth, (axum::http::StatusCode, Json<Value>)> {
    let config = state.config().await;
    if config.client_id.is_empty() || config.client_secret.is_empty() {
        return Err(err_json(401, "Twitch credentials not configured"));
    }
    let redirect_uri = format!("http://localhost:{}/callback", config.server_port);
    Ok(TwitchAuth::new(
        config.client_id.clone(),
        config.client_secret.clone(),
        redirect_uri,
    ))
}

async fn get_valid_token(
    state: &SharedState,
) -> Result<twitch_client::Token, (axum::http::StatusCode, Json<Value>)> {
    let db_token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
        .ok_or_else(|| err_json(401, "No Twitch token stored"))?;

    let current = to_twitch_token(&db_token);
    let auth = create_auth(state).await?;
    let refreshed = auth
        .get_or_refresh_token(&current)
        .await
        .map_err(map_twitch_error)?;

    if let Some(token) = refreshed {
        state
            .db()
            .save_token(&to_db_token(&token))
            .map_err(|e| err_json(500, &e.to_string()))?;
        tracing::info!(expires_at = token.expires_at, "Token auto-refreshed");
        return Ok(token);
    }

    Ok(current)
}

fn is_unauthorized_error(err: &TwitchError) -> bool {
    matches!(err, TwitchError::ApiError { status: 401, .. })
}

fn is_not_found_error(err: &TwitchError) -> bool {
    matches!(err, TwitchError::ApiError { status: 404, .. })
}

fn is_rotated_refresh_token(current: &twitch_client::Token, latest: &twitch_client::Token) -> bool {
    latest.refresh_token != current.refresh_token
}

fn offline_stream_status_payload() -> Value {
    json!({
        "is_live": false,
        "viewer_count": 0,
        "isLive": false,
        "viewerCount": 0,
        "title": null,
        "startedAt": null
    })
}

fn stream_status_payload(status: &twitch_client::api::StreamStatus) -> Value {
    let title = status.info.as_ref().map(|info| info.title.clone());
    let started_at = status
        .info
        .as_ref()
        .and_then(|info| info.started_at.clone());

    json!({
        "is_live": status.is_live,
        "viewer_count": status.viewer_count,
        "isLive": status.is_live,
        "viewerCount": status.viewer_count,
        "title": title,
        "startedAt": started_at,
        "info": status.info
    })
}

fn verify_twitch_success_payload(user: &TwitchUser) -> Value {
    json!({
        "verified": true,
        "has_token": true,
        "id": user.id,
        "login": user.login,
        "display_name": user.display_name,
        "profile_image_url": user.profile_image_url
    })
}

fn verify_twitch_error_payload(
    twitch_user_id: &str,
    has_token: bool,
    error: impl Into<String>,
) -> Value {
    json!({
        "verified": false,
        "has_token": has_token,
        "id": twitch_user_id,
        "login": "",
        "display_name": "",
        "profile_image_url": null,
        "error": error.into()
    })
}

async fn force_refresh_token(
    state: &SharedState,
    current: &twitch_client::Token,
) -> Result<twitch_client::Token, (axum::http::StatusCode, Json<Value>)> {
    let _guard = TOKEN_REFRESH_LOCK.lock().await;

    if let Some(db_token) = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
    {
        let latest = to_twitch_token(&db_token);
        if is_rotated_refresh_token(current, &latest) {
            tracing::info!("Token already refreshed by another request; reusing latest token");
            return Ok(latest);
        }
    }

    let auth = create_auth(state).await?;
    let new_token = auth
        .refresh_token(&current.refresh_token)
        .await
        .map_err(map_twitch_error)?;
    state
        .db()
        .save_token(&to_db_token(&new_token))
        .map_err(|e| err_json(500, &e.to_string()))?;
    tracing::info!(
        expires_at = new_token.expires_at,
        "Token refreshed after 401"
    );
    Ok(new_token)
}

// ---------------------------------------------------------------------------
// Verification & Auth status
// ---------------------------------------------------------------------------

