//! Twitch API endpoints (OAuth, verification, custom rewards, stream status).

use std::sync::LazyLock;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::{Html, IntoResponse, Redirect};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Mutex;
use uuid::Uuid;

use twitch_client::TwitchError;
use twitch_client::api::{CreateRewardRequest, TwitchApiClient, UpdateRewardRequest};
use twitch_client::auth::TwitchAuth;

use crate::app::SharedState;
use crate::events;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;
static TOKEN_REFRESH_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

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

/// GET /api/twitch/verify
pub async fn verify_twitch(State(state): State<SharedState>) -> ApiResult {
    let config = state.config().await;
    let configured = !config.client_id.is_empty()
        && !config.client_secret.is_empty()
        && !config.twitch_user_id.is_empty();
    if !configured {
        return Ok(Json(
            json!({ "verified": false, "error": "Twitch credentials not configured" }),
        ));
    }
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({
        "verified": token.is_some(),
        "has_token": token.is_some(),
        "id": config.twitch_user_id
    })))
}

/// GET /api/settings/auth/status
pub async fn auth_status(State(state): State<SharedState>) -> ApiResult {
    let token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let auth_url = match create_auth(&state).await {
        Ok(auth) => auth.get_auth_url().unwrap_or_default(),
        Err(_) => String::new(),
    };
    Ok(Json(json!({
        "authenticated": token.is_some(),
        "authUrl": auth_url,
        "expiresAt": token.as_ref().map(|t| t.expires_at),
    })))
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/// GET /auth – Redirect to Twitch OAuth
pub async fn auth_redirect(State(state): State<SharedState>) -> impl IntoResponse {
    let auth = match create_auth(&state).await {
        Ok(a) => a,
        Err(e) => return Err(e),
    };
    let oauth_state = Uuid::new_v4().to_string();
    state.set_oauth_state(oauth_state.clone()).await;
    let url = auth
        .get_auth_url_with_state(Some(&oauth_state))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Redirect::temporary(&url))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// GET /callback – Exchange OAuth code for tokens.
pub async fn callback(
    State(state): State<SharedState>,
    Query(q): Query<CallbackQuery>,
) -> Result<Html<String>, (axum::http::StatusCode, Json<Value>)> {
    if let Some(error) = q.error {
        let desc = q.error_description.unwrap_or_default();
        return Ok(Html(format!(
            r#"<!DOCTYPE html><html><body><h2>認証エラー</h2><p>{error}: {desc}</p>
            <script>setTimeout(()=>window.close(),5000)</script></body></html>"#
        )));
    }
    let code = q
        .code
        .filter(|c| !c.is_empty())
        .ok_or_else(|| err_json(400, "OAuth code missing"))?;
    let callback_state = q
        .state
        .filter(|s| !s.is_empty())
        .ok_or_else(|| err_json(400, "OAuth state missing"))?;
    let expected_state = state
        .take_oauth_state()
        .await
        .ok_or_else(|| err_json(400, "OAuth state not initialized"))?;
    if callback_state != expected_state {
        return Err(err_json(400, "OAuth state mismatch"));
    }
    let auth = create_auth(&state).await?;
    let token = auth.exchange_code(&code).await.map_err(map_twitch_error)?;
    state
        .db()
        .save_token(&to_db_token(&token))
        .map_err(|e| err_json(500, &e.to_string()))?;
    tracing::info!(expires_at = token.expires_at, "OAuth token saved");
    let _ = state
        .ws_sender()
        .send(json!({"type":"auth_success","data":{"authenticated":true}}).to_string());
    state.emit_event(
        events::AUTH_SUCCESS,
        events::AuthSuccessPayload {
            authenticated: true,
        },
    );

    Ok(Html(
        r#"<!DOCTYPE html><html><body>
<h2>認証成功！</h2><p>このウィンドウは自動的に閉じます。</p>
<script>setTimeout(()=>window.close(),2000)</script></body></html>"#
            .to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/// GET|POST /api/twitch/refresh-token
pub async fn refresh_token(State(state): State<SharedState>) -> ApiResult {
    let current = get_valid_token(&state).await?;
    let new_token = force_refresh_token(&state, &current).await?;
    Ok(Json(
        json!({ "success": true, "expires_at": new_token.expires_at }),
    ))
}

// ---------------------------------------------------------------------------
// Stream status
// ---------------------------------------------------------------------------

/// GET /api/stream/status
pub async fn stream_status(State(state): State<SharedState>) -> ApiResult {
    let token = match get_valid_token(&state).await {
        Ok(token) => token,
        Err(_) => return Ok(Json(offline_stream_status_payload())),
    };
    let (client_id, twitch_user_id) = {
        let config = state.config().await;
        (config.client_id.clone(), config.twitch_user_id.clone())
    };
    if twitch_user_id.is_empty() {
        return Ok(Json(offline_stream_status_payload()));
    }
    let client = TwitchApiClient::new(client_id);
    let status = match client.get_stream_info(&token, &twitch_user_id).await {
        Ok(status) => status,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("stream_status got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .get_stream_info(&refreshed, &twitch_user_id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    state.set_stream_live(status.is_live).await;
    Ok(Json(stream_status_payload(&status)))
}

// ---------------------------------------------------------------------------
// Custom rewards CRUD
// ---------------------------------------------------------------------------

/// GET /api/twitch/custom-rewards
pub async fn get_custom_rewards(State(state): State<SharedState>) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let rewards = match client
        .get_custom_rewards(&token, &config.twitch_user_id)
        .await
    {
        Ok(rewards) => rewards,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("get_custom_rewards got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .get_custom_rewards(&refreshed, &config.twitch_user_id)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": rewards })))
}

/// POST /api/twitch/custom-rewards
pub async fn create_custom_reward(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = CreateRewardRequest {
        title: body["title"].as_str().unwrap_or("").to_string(),
        cost: body["cost"].as_u64().unwrap_or(100),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
        is_user_input_required: body["is_user_input_required"].as_bool(),
        should_redemptions_skip_request_queue: body["should_redemptions_skip_request_queue"]
            .as_bool(),
    };
    let reward = match client
        .create_custom_reward(&token, &config.twitch_user_id, &req)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("create_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .create_custom_reward(&refreshed, &config.twitch_user_id, &req)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    let _ = state
        .db()
        .record_app_created_reward(&reward.id, &reward.title);
    Ok(Json(json!({ "data": reward })))
}

/// POST /api/twitch/custom-rewards/create (legacy alias)
pub async fn create_custom_reward_legacy(
    state: State<SharedState>,
    body: Json<Value>,
) -> ApiResult {
    create_custom_reward(state, body).await
}

/// PUT /api/twitch/custom-rewards/:id
pub async fn update_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    let req = UpdateRewardRequest {
        title: body["title"].as_str().map(String::from),
        cost: body["cost"].as_u64(),
        prompt: body["prompt"].as_str().map(String::from),
        is_enabled: body["is_enabled"].as_bool(),
        is_paused: body["is_paused"].as_bool(),
        background_color: body["background_color"].as_str().map(String::from),
    };
    let reward = match client
        .update_custom_reward(&token, &config.twitch_user_id, &id, &req)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("update_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .update_custom_reward(&refreshed, &config.twitch_user_id, &id, &req)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": reward })))
}

/// PATCH /api/twitch/custom-rewards/:id/toggle
pub async fn toggle_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    body: Option<Json<Value>>,
) -> ApiResult {
    let mut token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());

    let target_enabled = body
        .as_ref()
        .and_then(|b| b.get("is_enabled"))
        .and_then(|v| v.as_bool());

    let is_enabled = if let Some(v) = target_enabled {
        v
    } else {
        let rewards = match client
            .get_custom_rewards(&token, &config.twitch_user_id)
            .await
        {
            Ok(rewards) => rewards,
            Err(err) if is_unauthorized_error(&err) => {
                tracing::warn!("toggle_custom_reward(get) got 401, refreshing token and retrying");
                let refreshed = force_refresh_token(&state, &token).await?;
                token = refreshed.clone();
                client
                    .get_custom_rewards(&token, &config.twitch_user_id)
                    .await
                    .map_err(map_twitch_error)?
            }
            Err(err) => return Err(map_twitch_error(err)),
        };
        let current = rewards
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| err_json(404, "Reward not found"))?;
        !current.is_enabled
    };

    let reward = match client
        .update_reward_enabled(&token, &config.twitch_user_id, &id, is_enabled)
        .await
    {
        Ok(reward) => reward,
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("toggle_custom_reward(update) got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .update_reward_enabled(&refreshed, &config.twitch_user_id, &id, is_enabled)
                .await
                .map_err(map_twitch_error)?
        }
        Err(err) => return Err(map_twitch_error(err)),
    };
    Ok(Json(json!({ "data": reward })))
}

/// DELETE /api/twitch/custom-rewards/:id
pub async fn delete_custom_reward(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    let token = get_valid_token(&state).await?;
    let config = state.config().await;
    if config.twitch_user_id.is_empty() {
        return Err(err_json(401, "TWITCH_USER_ID is not configured"));
    }
    let client = TwitchApiClient::new(config.client_id.clone());
    match client
        .delete_custom_reward(&token, &config.twitch_user_id, &id)
        .await
    {
        Ok(_) => {}
        Err(err) if is_unauthorized_error(&err) => {
            tracing::warn!("delete_custom_reward got 401, refreshing token and retrying");
            let refreshed = force_refresh_token(&state, &token).await?;
            client
                .delete_custom_reward(&refreshed, &config.twitch_user_id, &id)
                .await
                .map_err(map_twitch_error)?;
        }
        Err(err) => return Err(map_twitch_error(err)),
    }
    Ok(Json(json!({ "success": true })))
}

// ---------------------------------------------------------------------------
// Reward groups by reward
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RewardGroupByRewardQuery {
    pub reward_id: Option<String>,
}

/// GET /api/twitch/reward-groups/by-reward
pub async fn reward_groups_by_reward(
    State(state): State<SharedState>,
    Query(q): Query<RewardGroupByRewardQuery>,
) -> ApiResult {
    let reward_id = q.reward_id.unwrap_or_default();
    if reward_id.is_empty() {
        return Ok(Json(json!({ "data": [] })));
    }
    let groups = state
        .db()
        .get_reward_groups_by_reward_id(&reward_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "data": groups })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use twitch_client::api::{StreamInfo, StreamStatus};

    #[test]
    fn unauthorized_error_only_matches_401() {
        let unauthorized = TwitchError::ApiError {
            status: 401,
            message: "unauthorized".into(),
        };
        let forbidden = TwitchError::ApiError {
            status: 403,
            message: "forbidden".into(),
        };

        assert!(is_unauthorized_error(&unauthorized));
        assert!(!is_unauthorized_error(&forbidden));
        assert!(!is_unauthorized_error(&TwitchError::AuthRequired));
    }

    #[test]
    fn token_refresh_failed_maps_to_401() {
        let (status, body) = map_twitch_error(TwitchError::TokenRefreshFailed("invalid".into()));
        assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
        assert_eq!(body.0["error"], "Token refresh failed, please re-authenticate");
    }

    #[test]
    fn rotated_refresh_token_is_detected() {
        let current = twitch_client::Token {
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            scope: "scope".into(),
            expires_at: 0,
        };
        let latest = twitch_client::Token {
            access_token: "new-access".into(),
            refresh_token: "new-refresh".into(),
            scope: "scope".into(),
            expires_at: 1,
        };
        let same = twitch_client::Token {
            access_token: "new-access".into(),
            refresh_token: "old-refresh".into(),
            scope: "scope".into(),
            expires_at: 1,
        };

        assert!(is_rotated_refresh_token(&current, &latest));
        assert!(!is_rotated_refresh_token(&current, &same));
    }

    #[test]
    fn offline_stream_status_payload_has_compat_keys() {
        let payload = offline_stream_status_payload();
        assert_eq!(payload["is_live"], false);
        assert_eq!(payload["viewer_count"], 0);
        assert_eq!(payload["isLive"], false);
        assert_eq!(payload["viewerCount"], 0);
        assert!(payload["title"].is_null());
        assert!(payload["startedAt"].is_null());
    }

    #[test]
    fn stream_status_payload_includes_snake_and_camel_case_fields() {
        let status = StreamStatus {
            is_live: true,
            viewer_count: 77,
            info: Some(StreamInfo {
                id: "stream-id".into(),
                user_id: "user-id".into(),
                user_login: "user-login".into(),
                game_name: "game".into(),
                title: "live title".into(),
                viewer_count: 77,
                started_at: Some("2026-02-16T00:00:00Z".into()),
                stream_type: "live".into(),
            }),
        };

        let payload = stream_status_payload(&status);
        assert_eq!(payload["is_live"], true);
        assert_eq!(payload["viewer_count"], 77);
        assert_eq!(payload["isLive"], true);
        assert_eq!(payload["viewerCount"], 77);
        assert_eq!(payload["title"], "live title");
        assert_eq!(payload["startedAt"], "2026-02-16T00:00:00Z");
        assert_eq!(payload["info"]["id"], "stream-id");
    }
}
