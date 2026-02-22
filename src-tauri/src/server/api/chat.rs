//! Chat history API.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};
use twitch_client::TwitchError;
use twitch_client::api::{TwitchApiClient, TwitchUser};

use crate::app::SharedState;
use crate::notification::{queue, types};
use crate::services::channel_points_assets;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;
const IRC_RETENTION_SECONDS: i64 = 24 * 60 * 60;

#[derive(Debug, Deserialize)]
pub struct ChatQuery {
    pub since: Option<i64>,
    pub limit: Option<i64>,
    pub days: Option<i64>,
    pub channel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PostChatBody {
    pub message: String,
    pub username: Option<String>,
    pub user_id: Option<String>,
    pub avatar_url: Option<String>,
    pub channel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatUserProfileBody {
    pub user_id: String,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChatMessageBody {
    pub channel: String,
    pub message_id: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub message: String,
    pub fragments: Option<Value>,
    pub timestamp: Option<String>,
}

fn normalize_channel_login(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_start_matches('#').to_lowercase();
    if normalized.len() < 3 || normalized.len() > 25 {
        return None;
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return None;
    }
    Some(normalized)
}

fn map_twitch_error(err: TwitchError) -> (axum::http::StatusCode, Json<Value>) {
    match err {
        TwitchError::ApiError { status, message } => err_json(status, &message),
        TwitchError::AuthRequired => err_json(401, "Authentication required"),
        other => err_json(500, &other.to_string()),
    }
}

fn irc_cutoff(now_unix: i64) -> i64 {
    now_unix - IRC_RETENTION_SECONDS
}

fn parse_created_at_from_rfc3339(raw: Option<&str>) -> i64 {
    raw.and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| chrono::Utc::now().timestamp())
}

async fn resolve_default_user_id(state: &SharedState, body: &PostChatBody) -> String {
    if let Some(user_id) = body
        .user_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return user_id;
    }

    let configured = {
        let config = state.config().await;
        config.twitch_user_id.clone()
    };
    if !configured.trim().is_empty() {
        return configured;
    }

    "webui-local".to_string()
}

async fn resolve_default_username(state: &SharedState, user_id: &str) -> String {
    match state.db().get_chat_user_profile(user_id) {
        Ok(Some(profile)) if !profile.username.trim().is_empty() => profile.username,
        _ => {
            if !user_id.trim().is_empty() {
                return user_id.to_string();
            }
            "WebUI".to_string()
        }
    }
}

async fn resolve_avatar_url(state: &SharedState, body: &PostChatBody, user_id: &str) -> String {
    if let Some(avatar_url) = body
        .avatar_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return avatar_url;
    }

    if let Ok(Some(profile)) = state.db().get_chat_user_profile(user_id) {
        if !profile.avatar_url.trim().is_empty() {
            return profile.avatar_url;
        }
    }

    if let Ok(Some(cached)) = state.db().get_latest_chat_avatar(user_id) {
        if !cached.trim().is_empty() {
            return cached;
        }
    }

    channel_points_assets::fetch_reward_avatar_url(state, user_id).await
}

async fn fetch_twitch_user_profile(state: &SharedState, user_id: &str) -> Option<TwitchUser> {
    if user_id.trim().is_empty() {
        return None;
    }

    let (client_id, access_token, refresh_token, scope, expires_at) = {
        let config = state.config().await;
        let token = state.db().get_latest_token().ok().flatten()?;
        (
            config.client_id.clone(),
            token.access_token,
            token.refresh_token,
            token.scope,
            token.expires_at,
        )
    };

    if client_id.is_empty() || access_token.is_empty() {
        return None;
    }

    let token = twitch_client::Token {
        access_token,
        refresh_token,
        scope,
        expires_at,
    };
    let client = TwitchApiClient::new(client_id);
    client.get_user(&token, user_id).await.ok()
}

async fn resolve_chat_user_profile(
    state: &SharedState,
    user_id: &str,
    username_hint: Option<&str>,
) -> Result<(String, String), (axum::http::StatusCode, Json<Value>)> {
    let normalized_user_id = user_id.trim();
    if normalized_user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let existing = state
        .db()
        .get_chat_user_profile(normalized_user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let hinted_username = username_hint
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let mut username = hinted_username
        .clone()
        .or_else(|| existing.as_ref().map(|p| p.username.clone()))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| normalized_user_id.to_string());
    let mut avatar_url = existing
        .as_ref()
        .map(|p| p.avatar_url.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();

    if avatar_url.is_empty()
        || username == normalized_user_id
        || username.eq_ignore_ascii_case("webui")
    {
        if let Some(user) = fetch_twitch_user_profile(state, normalized_user_id).await {
            if username == normalized_user_id || username.eq_ignore_ascii_case("webui") {
                username = if user.display_name.trim().is_empty() {
                    user.login
                } else {
                    user.display_name
                };
            }
            if avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }

    let now = chrono::Utc::now().timestamp();
    state
        .db()
        .upsert_chat_user_profile(normalized_user_id, &username, &avatar_url, now)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok((username, avatar_url))
}

async fn save_irc_chat_message(
    state: &SharedState,
    channel_login: &str,
    message_id: &str,
    user_id: &str,
    username_hint: Option<&str>,
    message: &str,
    fragments: Value,
    created_at: i64,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let (username, avatar_url) = if !user_id.trim().is_empty() {
        resolve_chat_user_profile(state, user_id, username_hint).await?
    } else {
        (
            username_hint
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "unknown".to_string()),
            String::new(),
        )
    };

    let cutoff = irc_cutoff(chrono::Utc::now().timestamp());
    state
        .db()
        .cleanup_irc_chat_messages_before(cutoff)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let irc_msg = overlay_db::chat::IrcChatMessage {
        id: 0,
        channel_login: channel_login.to_string(),
        message_id: message_id.to_string(),
        user_id: user_id.to_string(),
        username: username.clone(),
        message: message.to_string(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        created_at,
    };
    state
        .db()
        .add_irc_chat_message(&irc_msg)
        .map_err(|e| err_json(500, &e.to_string()))?;
    state
        .db()
        .cleanup_irc_chat_messages_before(cutoff)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(json!({
        "channel": channel_login,
        "username": username,
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "fragments": fragments,
        "avatarUrl": avatar_url,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": chrono::DateTime::from_timestamp(created_at, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    }))
}

async fn post_twitch_chat_to_channel(
    state: &SharedState,
    raw_channel_login: &str,
    message: &str,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let channel_login =
        normalize_channel_login(raw_channel_login).ok_or_else(|| err_json(400, "invalid channel"))?;

    let config = state.config().await;
    if config.client_id.trim().is_empty() || config.twitch_user_id.trim().is_empty() {
        return Err(err_json(401, "Twitch credentials not configured"));
    }

    let db_token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
        .ok_or_else(|| err_json(401, "No Twitch token stored"))?;

    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };

    let api = TwitchApiClient::new(config.client_id.clone());
    let sender_user = api
        .get_user(&token, &config.twitch_user_id)
        .await
        .map_err(map_twitch_error)?;
    let broadcaster_user = api
        .get_user_by_login(&token, &channel_login)
        .await
        .map_err(map_twitch_error)?;

    let request_body = json!({
        "broadcaster_id": broadcaster_user.id,
        "sender_id": sender_user.id,
        "message": message,
    });
    let response = reqwest::Client::new()
        .post("https://api.twitch.tv/helix/chat/messages")
        .header("Authorization", format!("Bearer {}", token.access_token))
        .header("Client-Id", config.client_id.clone())
        .json(&request_body)
        .send()
        .await
        .map_err(|e| err_json(500, &e.to_string()))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .unwrap_or_else(|_| "unknown error".to_string());
    if !status.is_success() {
        return Err(err_json(
            status.as_u16(),
            &format!("Failed to send message to #{channel_login}: {response_text}"),
        ));
    }

    let parsed_response: Value =
        serde_json::from_str(&response_text).unwrap_or_else(|_| json!({ "raw": response_text }));
    let is_sent = parsed_response
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .and_then(|entry| entry.get("is_sent"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !is_sent {
        let reason = parsed_response
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|entry| entry.get("drop_reason"))
            .and_then(|v| v.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown reason");
        return Err(err_json(
            400,
            &format!("Failed to send message to #{channel_login}: {reason}"),
        ));
    }

    let sender_username = if sender_user.display_name.trim().is_empty() {
        sender_user.login
    } else {
        sender_user.display_name
    };
    let now = chrono::Utc::now();
    let message_id = parsed_response
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .and_then(|entry| entry.get("message_id"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("irc-local-{}", now.timestamp_micros()));
    let fragments = json!([{ "type": "text", "text": message }]);
    save_irc_chat_message(
        state,
        &channel_login,
        &message_id,
        &sender_user.id,
        Some(&sender_username),
        message,
        fragments,
        now.timestamp(),
    )
    .await
}

/// GET /api/chat/messages
pub async fn get_messages(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "messages": messages, "count": messages.len() }),
    ))
}

/// GET /api/chat/history (legacy compatibility endpoint)
pub async fn get_history(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_chat_messages_since(since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "messages": messages })))
}

/// GET /api/chat/irc/history
pub async fn get_irc_history(
    State(state): State<SharedState>,
    Query(q): Query<ChatQuery>,
) -> ApiResult {
    let channel = q.channel.unwrap_or_default();
    let channel_login = normalize_channel_login(&channel)
        .ok_or_else(|| err_json(400, "channel is required"))?;
    let now = chrono::Utc::now().timestamp();
    let since_requested = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or_else(|| irc_cutoff(now));
    let since = since_requested.max(irc_cutoff(now));

    state
        .db()
        .cleanup_irc_chat_messages_before(irc_cutoff(now))
        .map_err(|e| err_json(500, &e.to_string()))?;
    let messages = state
        .db()
        .get_irc_chat_messages_since(&channel_login, since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "channel": channel_login, "messages": messages })))
}

/// POST /api/chat/irc/message
pub async fn post_irc_message(
    State(state): State<SharedState>,
    Json(body): Json<IrcChatMessageBody>,
) -> ApiResult {
    let channel_login = normalize_channel_login(&body.channel)
        .ok_or_else(|| err_json(400, "invalid channel"))?;
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }
    let user_id = body
        .user_id
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let message_id = body
        .message_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("irc-ingest-{}", chrono::Utc::now().timestamp_micros()));
    let fragments = body
        .fragments
        .clone()
        .unwrap_or_else(|| json!([{ "type": "text", "text": message }]));
    let created_at = parse_created_at_from_rfc3339(body.timestamp.as_deref());

    let ws_payload = save_irc_chat_message(
        &state,
        &channel_login,
        &message_id,
        &user_id,
        body.username.as_deref(),
        &message,
        fragments,
        created_at,
    )
    .await?;

    Ok(Json(json!({ "status": "ok", "message": ws_payload })))
}

/// POST /api/chat/post
pub async fn post_chat_message(
    State(state): State<SharedState>,
    Json(body): Json<PostChatBody>,
) -> ApiResult {
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }

    if let Some(channel) = body.channel.as_deref().filter(|s| !s.trim().is_empty()) {
        let ws_payload = post_twitch_chat_to_channel(&state, channel, &message).await?;
        return Ok(Json(json!({ "status": "ok", "message": ws_payload })));
    }

    let user_id = resolve_default_user_id(&state, &body).await;
    let username = body
        .username
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "".to_string());
    let mut username = if username.is_empty() {
        resolve_default_username(&state, &user_id).await
    } else {
        username
    };

    let now = chrono::Utc::now();
    let created_at = now.timestamp();
    let message_id = format!("local-{}", now.timestamp_micros());

    let mut avatar_url = resolve_avatar_url(&state, &body, &user_id).await;
    if (username == user_id || username.eq_ignore_ascii_case("webui")) || avatar_url.is_empty() {
        if let Some(user) = fetch_twitch_user_profile(&state, &user_id).await {
            if username == user_id || username.eq_ignore_ascii_case("webui") {
                username = if !user.display_name.trim().is_empty() {
                    user.display_name
                } else {
                    user.login
                };
            }
            if avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }

    let fragments = json!([{ "type": "text", "text": message }]);
    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        message: message.clone(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at,
    };

    state
        .db()
        .upsert_chat_user_profile(&user_id, &username, &avatar_url, created_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    state
        .db()
        .add_chat_message(&msg)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let ws_payload = json!({
        "username": username,
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "fragments": [{
            "type": "text",
            "text": msg.message,
        }],
        "avatarUrl": avatar_url,
        "translation": "",
        "translationStatus": "",
        "translationLang": "",
        "timestamp": now.to_rfc3339(),
    });
    let broadcast = json!({ "type": "chat-message", "data": ws_payload.clone() });
    let _ = state.ws_sender().send(broadcast.to_string());

    let notif = types::ChatNotification {
        username: username.clone(),
        message: message.clone(),
        fragments: vec![types::FragmentInfo::Text(message.clone())],
        avatar_url: if avatar_url.is_empty() {
            None
        } else {
            Some(avatar_url.clone())
        },
        color: None,
        display_mode: types::DisplayMode::Queue,
        notification_type: types::NotificationType::Chat,
    };
    let _ = queue::enqueue(notif).await;

    Ok(Json(json!({ "status": "ok", "message": ws_payload })))
}

/// POST /api/chat/user-profile
pub async fn upsert_user_profile(
    State(state): State<SharedState>,
    Json(body): Json<ChatUserProfileBody>,
) -> ApiResult {
    let user_id = body.user_id.trim();
    if user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let (username, avatar_url) = resolve_chat_user_profile(&state, user_id, body.username.as_deref()).await?;
    Ok(Json(json!({
        "user_id": user_id,
        "username": username,
        "avatar_url": avatar_url,
    })))
}

/// POST /api/chat/cleanup
pub async fn cleanup_messages(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let hours = body["hours"].as_i64().unwrap_or(24);
    let cutoff = chrono::Utc::now().timestamp() - (hours * 3600);
    state
        .db()
        .cleanup_chat_messages_before(cutoff)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "status": "ok", "message": format!("Cleaned up messages older than {hours}h") }),
    ))
}

/// GET /api/chat/avatar/:user_id
pub async fn get_avatar(
    State(state): State<SharedState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> ApiResult {
    let mut url = state
        .db()
        .get_latest_chat_avatar(&user_id)
        .map_err(|e| err_json(500, &e.to_string()))?;

    if url.as_deref().unwrap_or_default().trim().is_empty() && !user_id.trim().is_empty() {
        let (_, avatar_url) = resolve_chat_user_profile(&state, &user_id, None).await?;
        if !avatar_url.trim().is_empty() {
            url = Some(avatar_url);
        }
    }

    Ok(Json(json!({ "avatar_url": url })))
}
