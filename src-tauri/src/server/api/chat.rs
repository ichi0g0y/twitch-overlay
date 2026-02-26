//! Chat history API.

use axum::Json;
use axum::extract::{Query, State};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use tokio::time::{Duration, Instant, timeout};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use twitch_client::TwitchError;
use twitch_client::api::{TwitchApiClient, TwitchUser};

use crate::app::SharedState;
use crate::notification::{queue, types};
use crate::services::channel_points_assets;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;
const IRC_RETENTION_MAX_MESSAGES_PER_CHANNEL: i64 = 20_000;
const TWITCH_IRC_WS_ENDPOINT: &str = "wss://irc-ws.chat.twitch.tv:443";
const TWITCH_IRC_SEND_TIMEOUT_SECS: u64 = 8;
const IVR_TWITCH_USER_API_BASE: &str = "https://api.ivr.fi/v2/twitch/user";
const DECAPI_TWITCH_FOLLOWCOUNT_BASE: &str = "https://decapi.me/twitch/followcount";
const USER_PROFILE_DETAIL_CACHE_KEY_PREFIX: &str = "chat_user_profile_detail:";
const USER_PROFILE_DETAIL_CACHE_TTL_SECONDS: i64 = 24 * 60 * 60;

struct TwitchIrcIdentity {
    token: twitch_client::Token,
    sender_user: TwitchUser,
    nick: String,
}

#[derive(Debug, Deserialize)]
struct IvrTwitchUser {
    #[serde(default)]
    banner: String,
    #[serde(default)]
    followers: Option<u64>,
}

#[derive(Debug)]
struct IvrProfileSnapshot {
    banner: String,
    followers: Option<u64>,
}

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
pub struct ChatUserProfileDetailBody {
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub login: Option<String>,
    pub force_refresh: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChatMessageBody {
    pub channel: String,
    pub message_id: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub message: String,
    pub badge_keys: Option<Vec<String>>,
    pub fragments: Option<Value>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChannelProfilesQuery {
    pub channels: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IrcChannelProfileBody {
    pub channel: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatModerationAction {
    Timeout,
    Block,
}

#[derive(Debug, Deserialize)]
pub struct ChatModerationActionBody {
    pub action: ChatModerationAction,
    pub user_id: String,
    pub duration_seconds: Option<u32>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedUserProfileDetail {
    user_id: String,
    username: String,
    avatar_url: String,
    display_name: String,
    login: String,
    description: String,
    user_type: String,
    broadcaster_type: String,
    profile_image_url: String,
    cover_image_url: String,
    follower_count: Option<u64>,
    view_count: u64,
    created_at: String,
    cached_at: i64,
}

#[derive(Debug, Clone, Copy)]
struct ModerationCapabilities {
    can_timeout: bool,
    can_block: bool,
}

fn user_profile_detail_cache_key(user_id: &str) -> Option<String> {
    let normalized = user_id.trim();
    if normalized.is_empty() {
        return None;
    }
    Some(format!(
        "{USER_PROFILE_DETAIL_CACHE_KEY_PREFIX}{normalized}"
    ))
}

fn cached_user_profile_to_json(
    cached: &CachedUserProfileDetail,
    capabilities: ModerationCapabilities,
) -> Value {
    json!({
        "user_id": cached.user_id,
        "username": cached.username,
        "avatar_url": cached.avatar_url,
        "display_name": cached.display_name,
        "login": cached.login,
        "description": cached.description,
        "user_type": cached.user_type,
        "broadcaster_type": cached.broadcaster_type,
        "profile_image_url": cached.profile_image_url,
        "cover_image_url": cached.cover_image_url,
        "follower_count": cached.follower_count,
        "view_count": cached.view_count,
        "created_at": cached.created_at,
        "can_timeout": capabilities.can_timeout,
        "can_block": capabilities.can_block,
    })
}

fn load_cached_user_profile_detail(
    state: &SharedState,
    user_id: &str,
) -> Result<Option<CachedUserProfileDetail>, (axum::http::StatusCode, Json<Value>)> {
    let Some(cache_key) = user_profile_detail_cache_key(user_id) else {
        return Ok(None);
    };
    let Some(raw) = state
        .db()
        .get_setting(&cache_key)
        .map_err(|e| err_json(500, &e.to_string()))?
    else {
        return Ok(None);
    };

    match serde_json::from_str::<CachedUserProfileDetail>(&raw) {
        Ok(parsed) => Ok(Some(parsed)),
        Err(_) => Ok(None),
    }
}

fn save_cached_user_profile_detail(state: &SharedState, profile: &CachedUserProfileDetail) {
    let Some(cache_key) = user_profile_detail_cache_key(&profile.user_id) else {
        return;
    };
    let Ok(raw) = serde_json::to_string(profile) else {
        return;
    };
    if let Err(err) = state
        .db()
        .set_setting(&cache_key, &raw, "chat_profile_cache")
    {
        tracing::warn!("Failed to persist user profile detail cache: {err}");
    }
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

fn parse_channel_logins_csv(raw: Option<&str>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut channels = Vec::new();
    let Some(csv) = raw else {
        return channels;
    };

    for token in csv.split(',') {
        let Some(channel) = normalize_channel_login(token) else {
            continue;
        };
        if seen.insert(channel.clone()) {
            channels.push(channel);
        }
    }
    channels
}

fn token_has_scope(scope_csv: &str, required_scope: &str) -> bool {
    scope_csv
        .split(|ch: char| ch.is_whitespace() || ch == ',')
        .map(str::trim)
        .any(|scope| !scope.is_empty() && scope == required_scope)
}

async fn resolve_moderation_capabilities(state: &SharedState) -> ModerationCapabilities {
    let config = state.config().await;
    if config.client_id.trim().is_empty() || config.twitch_user_id.trim().is_empty() {
        return ModerationCapabilities {
            can_timeout: false,
            can_block: false,
        };
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        _ => {
            return ModerationCapabilities {
                can_timeout: false,
                can_block: false,
            };
        }
    };

    ModerationCapabilities {
        can_timeout: token_has_scope(&db_token.scope, "moderator:manage:banned_users"),
        can_block: token_has_scope(&db_token.scope, "user:manage:blocked_users"),
    }
}

fn map_twitch_error(err: TwitchError) -> (axum::http::StatusCode, Json<Value>) {
    match err {
        TwitchError::ApiError { status, message } => err_json(status, &message),
        TwitchError::AuthRequired => err_json(401, "Authentication required"),
        other => err_json(500, &other.to_string()),
    }
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

async fn fetch_twitch_user_profile_by_login(
    state: &SharedState,
    login: &str,
) -> Option<TwitchUser> {
    let normalized_login = login.trim().trim_start_matches('@').to_lowercase();
    if normalized_login.is_empty() {
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
    client
        .get_user_by_login(&token, &normalized_login)
        .await
        .ok()
}

async fn fetch_profile_snapshot_from_ivr(
    user_id: Option<&str>,
    login: Option<&str>,
) -> Option<IvrProfileSnapshot> {
    async fn fetch_once(query: &str) -> Option<IvrProfileSnapshot> {
        let url = format!("{IVR_TWITCH_USER_API_BASE}?{query}");
        let response = reqwest::Client::new().get(url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let users = response.json::<Vec<IvrTwitchUser>>().await.ok()?;
        let user = users.into_iter().next()?;
        let banner = user.banner.trim().to_string();
        if banner.is_empty() && user.followers.is_none() {
            return None;
        }
        Some(IvrProfileSnapshot {
            banner,
            followers: user.followers,
        })
    }

    let id_query = user_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(|id| format!("id={id}"));
    let login_query = login
        .map(str::trim)
        .map(|s| s.trim_start_matches('@').to_lowercase())
        .filter(|s| !s.is_empty())
        .map(|name| format!("login={name}"));

    let mut snapshot = None;
    if let Some(query) = id_query.as_deref() {
        snapshot = fetch_once(query).await;
    }

    let should_try_login = match snapshot.as_ref() {
        None => true,
        Some(found) => found.followers.is_none() || found.banner.trim().is_empty(),
    };
    if should_try_login {
        if let Some(query) = login_query.as_deref() {
            if let Some(by_login) = fetch_once(query).await {
                snapshot = match snapshot {
                    None => Some(by_login),
                    Some(current) => Some(IvrProfileSnapshot {
                        banner: if current.banner.trim().is_empty() {
                            by_login.banner
                        } else {
                            current.banner
                        },
                        followers: current.followers.or(by_login.followers),
                    }),
                };
            }
        }
    }

    snapshot
}

async fn fetch_follower_count_from_decapi(login: Option<&str>) -> Option<u64> {
    let normalized = login
        .map(str::trim)
        .map(|s| s.trim_start_matches('@').to_lowercase())
        .filter(|s| !s.is_empty())?;

    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return None;
    }

    let url = format!("{DECAPI_TWITCH_FOLLOWCOUNT_BASE}/{normalized}");
    let response = reqwest::Client::new().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    let cleaned = text.trim().replace(',', "");
    cleaned.parse::<u64>().ok()
}

async fn resolve_twitch_irc_identity(
    state: &SharedState,
) -> Result<TwitchIrcIdentity, (axum::http::StatusCode, Json<Value>)> {
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

    let nick = sender_user.login.trim().to_lowercase();
    if nick.is_empty() {
        return Err(err_json(500, "Failed to resolve Twitch username"));
    }

    Ok(TwitchIrcIdentity {
        token,
        sender_user,
        nick,
    })
}

async fn resolve_chat_user_profile(
    state: &SharedState,
    user_id: &str,
    username_hint: Option<&str>,
    force_refresh: bool,
) -> Result<(String, String, String), (axum::http::StatusCode, Json<Value>)> {
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
    let mut display_name = existing
        .as_ref()
        .map(|p| p.display_name.clone())
        .or_else(|| hinted_username.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| username.clone());
    let mut avatar_url = existing
        .as_ref()
        .map(|p| p.avatar_url.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();

    if force_refresh
        || avatar_url.is_empty()
        || username == normalized_user_id
        || username.eq_ignore_ascii_case("webui")
        || display_name.trim().is_empty()
    {
        if let Some(user) = fetch_twitch_user_profile(state, normalized_user_id).await {
            if force_refresh || username == normalized_user_id || username.eq_ignore_ascii_case("webui")
            {
                username = if user.login.trim().is_empty() {
                    normalized_user_id.to_string()
                } else {
                    user.login.clone()
                };
            }
            if force_refresh
                || display_name.trim().is_empty()
                || display_name.eq_ignore_ascii_case("webui")
            {
                display_name = if user.display_name.trim().is_empty() {
                    username.clone()
                } else {
                    user.display_name
                };
            }
            if force_refresh || avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }
    if display_name.trim().is_empty() {
        display_name = username.clone();
    }

    let now = chrono::Utc::now().timestamp();
    state
        .db()
        .upsert_chat_user_profile(
            normalized_user_id,
            &username,
            &display_name,
            &avatar_url,
            now,
        )
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok((username, display_name, avatar_url))
}

async fn save_irc_chat_message(
    state: &SharedState,
    channel_login: &str,
    message_id: &str,
    user_id: &str,
    username_hint: Option<&str>,
    display_name_hint: Option<&str>,
    avatar_url_hint: Option<&str>,
    message: &str,
    badge_keys: Vec<String>,
    fragments: Value,
    created_at: i64,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let normalized_username_hint = username_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let normalized_display_name_hint = display_name_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let normalized_avatar_url_hint = avatar_url_hint
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    let (mut username, mut display_name, mut avatar_url) = if !user_id.trim().is_empty() {
        resolve_chat_user_profile(state, user_id, username_hint, false).await?
    } else {
        let username = normalized_username_hint
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let display_name = normalized_display_name_hint
            .clone()
            .unwrap_or_else(|| username.clone());
        let avatar_url = normalized_avatar_url_hint.clone().unwrap_or_default();
        (username, display_name, avatar_url)
    };
    if !user_id.trim().is_empty() {
        let next_username = normalized_username_hint.unwrap_or_else(|| username.clone());
        let next_display_name = normalized_display_name_hint
            .unwrap_or_else(|| display_name.clone())
            .trim()
            .to_string();
        let next_display_name = if next_display_name.is_empty() {
            next_username.clone()
        } else {
            next_display_name
        };
        let next_avatar_url = normalized_avatar_url_hint.unwrap_or_else(|| avatar_url.clone());
        let now = chrono::Utc::now().timestamp();
        state
            .db()
            .upsert_chat_user_profile(
                user_id,
                &next_username,
                &next_display_name,
                &next_avatar_url,
                now,
            )
            .map_err(|e| err_json(500, &e.to_string()))?;
        username = next_username;
        display_name = next_display_name;
        avatar_url = next_avatar_url;
    }

    let irc_msg = overlay_db::chat::IrcChatMessage {
        id: 0,
        channel_login: channel_login.to_string(),
        message_id: message_id.to_string(),
        user_id: user_id.to_string(),
        username: username.clone(),
        display_name: display_name.clone(),
        message: message.to_string(),
        badge_keys: badge_keys.clone(),
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
        .cleanup_irc_chat_messages_exceeding_limit(
            channel_login,
            IRC_RETENTION_MAX_MESSAGES_PER_CHANNEL,
        )
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(json!({
        "channel": channel_login,
        "username": username,
        "displayName": display_name,
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "badge_keys": badge_keys,
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

async fn post_twitch_chat_via_irc_channel(
    state: &SharedState,
    raw_channel_login: &str,
    raw_message: &str,
) -> Result<Value, (axum::http::StatusCode, Json<Value>)> {
    let channel_login = normalize_channel_login(raw_channel_login)
        .ok_or_else(|| err_json(400, "invalid channel"))?;
    let message = raw_message.replace(['\r', '\n'], " ").trim().to_string();
    if message.is_empty() {
        return Err(err_json(400, "message is required"));
    }

    let identity = resolve_twitch_irc_identity(state).await?;

    let (mut ws, _) = connect_async(TWITCH_IRC_WS_ENDPOINT)
        .await
        .map_err(|e| err_json(502, &format!("Failed to connect Twitch IRC: {e}")))?;

    ws.send(WsMessage::Text(
        format!("PASS oauth:{}", identity.token.access_token).into(),
    ))
    .await
    .map_err(|e| err_json(502, &format!("Failed to authenticate Twitch IRC: {e}")))?;
    ws.send(WsMessage::Text(format!("NICK {}", identity.nick).into()))
        .await
        .map_err(|e| err_json(502, &format!("Failed to set Twitch IRC nickname: {e}")))?;
    ws.send(WsMessage::Text(
        "CAP REQ :twitch.tv/tags twitch.tv/commands"
            .to_string()
            .into(),
    ))
    .await
    .map_err(|e| {
        err_json(
            502,
            &format!("Failed to request Twitch IRC capabilities: {e}"),
        )
    })?;
    ws.send(WsMessage::Text(format!("JOIN #{channel_login}").into()))
        .await
        .map_err(|e| err_json(502, &format!("Failed to join Twitch IRC channel: {e}")))?;

    let privmsg = format!("PRIVMSG #{channel_login} :{message}");
    let deadline = Instant::now() + Duration::from_secs(TWITCH_IRC_SEND_TIMEOUT_SECS);
    let mut join_confirmed = false;
    let mut message_sent = false;

    while Instant::now() < deadline && !message_sent {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let next_frame = match timeout(remaining, ws.next()).await {
            Ok(frame) => frame,
            Err(_) => break,
        };

        let Some(frame) = next_frame else {
            break;
        };

        match frame.map_err(|e| err_json(502, &format!("Twitch IRC receive error: {e}")))? {
            WsMessage::Ping(payload) => {
                ws.send(WsMessage::Pong(payload))
                    .await
                    .map_err(|e| err_json(502, &format!("Failed to send Twitch IRC pong: {e}")))?;
            }
            WsMessage::Text(text) => {
                for line in text.lines().filter(|line| !line.is_empty()) {
                    if let Some(payload) = line.strip_prefix("PING ") {
                        ws.send(WsMessage::Text(format!("PONG {payload}").into()))
                            .await
                            .map_err(|e| {
                                err_json(502, &format!("Failed to reply Twitch IRC ping: {e}"))
                            })?;
                        continue;
                    }

                    if line.contains("Login authentication failed") {
                        return Err(err_json(
                            401,
                            "Twitch IRC authentication failed. Twitch再認証を実行してください。",
                        ));
                    }

                    if !join_confirmed
                        && (line.contains(&format!(" JOIN #{channel_login}"))
                            || line.contains(&format!(" 366 {} #{channel_login} :", identity.nick)))
                    {
                        join_confirmed = true;
                    }
                }

                if join_confirmed {
                    ws.send(WsMessage::Text(privmsg.clone().into()))
                        .await
                        .map_err(|e| {
                            err_json(502, &format!("Failed to send Twitch IRC message: {e}"))
                        })?;
                    message_sent = true;
                }
            }
            _ => {}
        }
    }

    if !message_sent {
        ws.send(WsMessage::Text(privmsg.into()))
            .await
            .map_err(|e| err_json(502, &format!("Failed to send Twitch IRC message: {e}")))?;
    }

    let _ = ws.close(None).await;

    let now = chrono::Utc::now();
    let sender_login = identity.sender_user.login.trim().to_string();
    let message_id = format!("irc-local-{}", now.timestamp_micros());
    save_irc_chat_message(
        state,
        &channel_login,
        &message_id,
        &identity.sender_user.id,
        Some(&sender_login),
        Some(&identity.sender_user.display_name),
        Some(&identity.sender_user.profile_image_url),
        &message,
        Vec::new(),
        json!([{ "type": "text", "text": message }]),
        now.timestamp(),
    )
    .await
}

/// GET /api/chat/irc/credentials
pub async fn get_irc_credentials(State(state): State<SharedState>) -> ApiResult {
    match resolve_twitch_irc_identity(&state).await {
        Ok(identity) => Ok(Json(json!({
            "authenticated": true,
            "nick": identity.nick,
            "pass": format!("oauth:{}", identity.token.access_token),
            "user_id": identity.sender_user.id,
            "login": identity.sender_user.login,
            "display_name": if identity.sender_user.display_name.trim().is_empty() {
                identity.sender_user.login
            } else {
                identity.sender_user.display_name
            },
        }))),
        Err((_, payload)) => {
            let reason = payload
                .0
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            Ok(Json(json!({
                "authenticated": false,
                "nick": "",
                "pass": "",
                "reason": reason,
            })))
        }
    }
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
    let channel_login =
        normalize_channel_login(&channel).ok_or_else(|| err_json(400, "channel is required"))?;
    let since = q
        .since
        .or_else(|| {
            q.days
                .map(|days| chrono::Utc::now().timestamp() - (days * 24 * 3600))
        })
        .unwrap_or(0);
    let messages = state
        .db()
        .get_irc_chat_messages_since(&channel_login, since, q.limit)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "channel": channel_login, "messages": messages }),
    ))
}

/// GET /api/chat/irc/channel-profiles?channels=foo,bar
pub async fn get_irc_channel_profiles(
    State(state): State<SharedState>,
    Query(q): Query<IrcChannelProfilesQuery>,
) -> ApiResult {
    let channels = parse_channel_logins_csv(q.channels.as_deref());
    if channels.is_empty() {
        return Ok(Json(json!({ "profiles": [] })));
    }

    let profiles = state
        .db()
        .get_irc_channel_profiles(&channels)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({ "profiles": profiles })))
}

/// POST /api/chat/irc/channel-profile
pub async fn post_irc_channel_profile(
    State(state): State<SharedState>,
    Json(body): Json<IrcChannelProfileBody>,
) -> ApiResult {
    let channel_login =
        normalize_channel_login(&body.channel).ok_or_else(|| err_json(400, "invalid channel"))?;
    let display_name = body.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(err_json(400, "display_name is required"));
    }

    let updated_at = chrono::Utc::now().timestamp();
    state
        .db()
        .upsert_irc_channel_profile(&channel_login, &display_name, updated_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({
        "status": "ok",
        "profile": {
            "channel_login": channel_login,
            "display_name": display_name,
            "updated_at": updated_at,
        }
    })))
}

/// POST /api/chat/irc/message
pub async fn post_irc_message(
    State(state): State<SharedState>,
    Json(body): Json<IrcChatMessageBody>,
) -> ApiResult {
    let channel_login =
        normalize_channel_login(&body.channel).ok_or_else(|| err_json(400, "invalid channel"))?;
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
    let badge_keys = body
        .badge_keys
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let created_at = parse_created_at_from_rfc3339(body.timestamp.as_deref());

    let ws_payload = save_irc_chat_message(
        &state,
        &channel_login,
        &message_id,
        &user_id,
        body.username.as_deref(),
        body.display_name.as_deref(),
        body.avatar_url.as_deref(),
        &message,
        badge_keys,
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
        let ws_payload = post_twitch_chat_via_irc_channel(&state, channel, &message).await?;
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
    let mut display_name = if let Ok(Some(profile)) = state.db().get_chat_user_profile(&user_id) {
        profile.display_name.trim().to_string()
    } else {
        String::new()
    };
    if display_name.is_empty() {
        display_name = username.clone();
    }

    let now = chrono::Utc::now();
    let created_at = now.timestamp();
    let message_id = format!("local-{}", now.timestamp_micros());

    let mut avatar_url = resolve_avatar_url(&state, &body, &user_id).await;
    if (username == user_id || username.eq_ignore_ascii_case("webui"))
        || display_name.trim().is_empty()
        || avatar_url.is_empty()
    {
        if let Some(user) = fetch_twitch_user_profile(&state, &user_id).await {
            if username == user_id || username.eq_ignore_ascii_case("webui") {
                username = if !user.login.trim().is_empty() {
                    user.login
                } else {
                    user_id.clone()
                };
            }
            display_name = if !user.display_name.trim().is_empty() {
                user.display_name
            } else {
                username.clone()
            };
            if avatar_url.is_empty() {
                avatar_url = user.profile_image_url;
            }
        }
    }
    if display_name.trim().is_empty() {
        display_name = username.clone();
    }

    let fragments = json!([{ "type": "text", "text": message }]);
    let msg = overlay_db::chat::ChatMessage {
        id: 0,
        message_id: message_id.clone(),
        user_id: user_id.clone(),
        username: username.clone(),
        display_name: display_name.clone(),
        message: message.clone(),
        badge_keys: Vec::new(),
        fragments_json: fragments.to_string(),
        avatar_url: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at,
    };

    state
        .db()
        .upsert_chat_user_profile(&user_id, &username, &display_name, &avatar_url, created_at)
        .map_err(|e| err_json(500, &e.to_string()))?;

    state
        .db()
        .add_chat_message(&msg)
        .map_err(|e| err_json(500, &e.to_string()))?;

    let ws_payload = json!({
        "username": username,
        "displayName": display_name.clone(),
        "userId": user_id,
        "messageId": message_id,
        "message": message,
        "badge_keys": [],
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
        username: display_name,
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

    let (username, display_name, avatar_url) =
        resolve_chat_user_profile(&state, user_id, body.username.as_deref(), false).await?;
    Ok(Json(json!({
        "user_id": user_id,
        "username": username,
        "display_name": display_name,
        "avatar_url": avatar_url,
    })))
}

/// POST /api/chat/moderation/action
pub async fn post_chat_moderation_action(
    State(state): State<SharedState>,
    Json(body): Json<ChatModerationActionBody>,
) -> ApiResult {
    let target_user_id = body.user_id.trim().to_string();
    if target_user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

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

    let can_timeout = token_has_scope(&token.scope, "moderator:manage:banned_users");
    let can_block = token_has_scope(&token.scope, "user:manage:blocked_users");
    let api = TwitchApiClient::new(config.client_id.clone());

    match body.action {
        ChatModerationAction::Timeout => {
            if !can_timeout {
                return Err(err_json(
                    403,
                    "Missing scope: moderator:manage:banned_users",
                ));
            }
            let duration_seconds = body.duration_seconds.unwrap_or(600).clamp(1, 1_209_600);
            let reason = body.reason.as_deref();
            let moderator = api
                .get_current_user(&token)
                .await
                .map_err(map_twitch_error)?;
            let moderator_id = moderator.id.trim();
            if moderator_id.is_empty() {
                return Err(err_json(500, "Failed to resolve moderator id"));
            }

            api.timeout_user(
                &token,
                &config.twitch_user_id,
                moderator_id,
                &target_user_id,
                duration_seconds,
                reason,
            )
            .await
            .map_err(map_twitch_error)?;

            Ok(Json(json!({
                "status": "ok",
                "action": "timeout",
                "user_id": target_user_id,
                "duration_seconds": duration_seconds,
            })))
        }
        ChatModerationAction::Block => {
            if !can_block {
                return Err(err_json(403, "Missing scope: user:manage:blocked_users"));
            }

            api.block_user(&token, &target_user_id)
                .await
                .map_err(map_twitch_error)?;

            Ok(Json(json!({
                "status": "ok",
                "action": "block",
                "user_id": target_user_id,
            })))
        }
    }
}

/// POST /api/chat/user-profile/detail
pub async fn get_user_profile_detail(
    State(state): State<SharedState>,
    Json(body): Json<ChatUserProfileDetailBody>,
) -> ApiResult {
    let now_unix = chrono::Utc::now().timestamp();
    let moderation_capabilities = resolve_moderation_capabilities(&state).await;
    let mut resolved_user_id = body
        .user_id
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let mut twitch_profile = None;

    if resolved_user_id.is_empty() {
        let login_hint = body
            .login
            .as_deref()
            .or(body.username.as_deref())
            .map(str::trim)
            .unwrap_or_default();
        if login_hint.is_empty() {
            return Err(err_json(400, "user_id or login is required"));
        }

        if let Some(profile) = state
            .db()
            .find_chat_user_profile_by_username(login_hint)
            .map_err(|e| err_json(500, &e.to_string()))?
        {
            resolved_user_id = profile.user_id.trim().to_string();
        }
        if resolved_user_id.is_empty() {
            twitch_profile = fetch_twitch_user_profile_by_login(&state, login_hint).await;
            if let Some(user) = twitch_profile.as_ref() {
                resolved_user_id = user.id.trim().to_string();
            }
        }
    }

    if resolved_user_id.is_empty() {
        return Err(err_json(404, "Twitch user not found"));
    }
    let force_refresh = body.force_refresh.unwrap_or(false);
    if !force_refresh {
        if let Some(cached) = load_cached_user_profile_detail(&state, &resolved_user_id)? {
            if now_unix - cached.cached_at <= USER_PROFILE_DETAIL_CACHE_TTL_SECONDS {
                return Ok(Json(cached_user_profile_to_json(
                    &cached,
                    moderation_capabilities,
                )));
            }
        }
    }

    let (username, _display_name, avatar_url) =
        resolve_chat_user_profile(&state, &resolved_user_id, body.username.as_deref(), force_refresh)
            .await?;
    if twitch_profile.is_none() {
        twitch_profile = fetch_twitch_user_profile(&state, &resolved_user_id).await;
    }

    let login = twitch_profile
        .as_ref()
        .map(|p| p.login.trim().to_string())
        .unwrap_or_default();
    let display_name = twitch_profile
        .as_ref()
        .map(|p| p.display_name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| username.clone());
    let description = twitch_profile
        .as_ref()
        .map(|p| p.description.trim().to_string())
        .unwrap_or_default();
    let broadcaster_type = twitch_profile
        .as_ref()
        .map(|p| p.broadcaster_type.trim().to_string())
        .unwrap_or_default();
    let user_type = twitch_profile
        .as_ref()
        .map(|p| p.user_type.trim().to_string())
        .unwrap_or_default();
    let profile_image_url = twitch_profile
        .as_ref()
        .map(|p| p.profile_image_url.trim().to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| avatar_url.clone());
    let cover_image_url = twitch_profile
        .as_ref()
        .map(|p| p.offline_image_url.trim().to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_default();
    let ivr_login_hint = if login.is_empty() {
        body.login
            .as_deref()
            .or(body.username.as_deref())
            .or(Some(username.as_str()))
    } else {
        Some(login.as_str())
    };
    let ivr_profile =
        fetch_profile_snapshot_from_ivr(Some(&resolved_user_id), ivr_login_hint).await;
    let cover_image_url = if cover_image_url.is_empty() {
        ivr_profile
            .as_ref()
            .map(|profile| profile.banner.trim().to_string())
            .filter(|url| !url.is_empty())
            .unwrap_or_default()
    } else {
        cover_image_url
    };
    let mut follower_count = ivr_profile.as_ref().and_then(|profile| profile.followers);
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(ivr_login_hint).await;
    }
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(body.username.as_deref()).await;
    }
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(Some(username.as_str())).await;
    }
    let view_count = twitch_profile
        .as_ref()
        .map(|p| p.view_count)
        .unwrap_or_default();
    let created_at = twitch_profile
        .as_ref()
        .map(|p| p.created_at.trim().to_string())
        .unwrap_or_default();
    let response_payload = CachedUserProfileDetail {
        user_id: resolved_user_id,
        username,
        avatar_url,
        display_name,
        login,
        description,
        user_type,
        broadcaster_type,
        profile_image_url,
        cover_image_url,
        follower_count,
        view_count,
        created_at,
        cached_at: now_unix,
    };
    save_cached_user_profile_detail(&state, &response_payload);
    Ok(Json(cached_user_profile_to_json(
        &response_payload,
        moderation_capabilities,
    )))
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
        let (_, _, avatar_url) = resolve_chat_user_profile(&state, &user_id, None, false).await?;
        if !avatar_url.trim().is_empty() {
            url = Some(avatar_url);
        }
    }

    Ok(Json(json!({ "avatar_url": url })))
}
