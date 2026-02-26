//! Emote list API.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;
use twitch_client::emotes::{Emote, EmoteCache};

use crate::app::SharedState;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct EmotesQuery {
    pub channels: Option<String>,
    pub priority_channel: Option<String>,
    pub refresh: Option<bool>,
}

#[derive(Clone)]
struct TwitchRuntime {
    client_id: String,
    broadcaster_id: String,
    token: Token,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum EmoteSource {
    Channel,
    Special,
    Unlocked,
    Global,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteItem {
    id: String,
    name: String,
    url: String,
    source: EmoteSource,
    channel_login: Option<String>,
    usable: bool,
    emote_type: Option<String>,
    tier: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteGroup {
    id: String,
    label: String,
    source: EmoteSource,
    channel_login: Option<String>,
    channel_avatar_url: Option<String>,
    priority: bool,
    emotes: Vec<EmoteItem>,
}

#[derive(Debug, Clone)]
struct UserEmoteCacheEntry {
    cached_at: Instant,
    emotes: Vec<Emote>,
    owner_login_by_id: HashMap<String, String>,
    owner_display_name_by_login: HashMap<String, String>,
    owner_avatar_url_by_login: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct ChannelEmoteCacheEntry {
    cached_at: Instant,
    emotes: Vec<Emote>,
}

const USER_EMOTE_CACHE_TTL: Duration = Duration::from_secs(300);
const CHANNEL_EMOTE_CACHE_TTL: Duration = Duration::from_secs(300);

static USER_EMOTE_CACHE: OnceLock<Mutex<HashMap<String, UserEmoteCacheEntry>>> = OnceLock::new();
static CHANNEL_EMOTE_CACHE: OnceLock<Mutex<HashMap<String, ChannelEmoteCacheEntry>>> =
    OnceLock::new();

fn user_emote_cache_map() -> &'static Mutex<HashMap<String, UserEmoteCacheEntry>> {
    USER_EMOTE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn channel_emote_cache_map() -> &'static Mutex<HashMap<String, ChannelEmoteCacheEntry>> {
    CHANNEL_EMOTE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn token_has_scope(scope_csv: &str, required_scope: &str) -> bool {
    scope_csv
        .split([' ', ','])
        .map(|scope| scope.trim())
        .any(|scope| !scope.is_empty() && scope == required_scope)
}

fn normalize_channel_login(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_start_matches('#').to_ascii_lowercase();
    if normalized.len() < 3 || normalized.len() > 25 {
        return None;
    }
    if normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        Some(normalized)
    } else {
        None
    }
}

fn parse_channel_logins_csv(raw: Option<&str>) -> Vec<String> {
    let Some(csv) = raw else {
        return Vec::new();
    };

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for token in csv.split(',') {
        let Some(login) = normalize_channel_login(token) else {
            continue;
        };
        if seen.insert(login.clone()) {
            out.push(login);
        }
    }
    out
}

fn emote_url_from_images(emote: &Emote) -> Option<String> {
    if !emote.id.is_empty() {
        let has_animated = emote
            .format
            .iter()
            .any(|value| value.eq_ignore_ascii_case("animated"));
        let has_static = emote
            .format
            .iter()
            .any(|value| value.eq_ignore_ascii_case("static"));
        let format = if has_animated {
            Some("animated")
        } else if has_static {
            Some("static")
        } else {
            None
        };

        if let Some(format) = format {
            let theme_mode = if emote
                .theme_mode
                .iter()
                .any(|value| value.eq_ignore_ascii_case("dark"))
            {
                "dark"
            } else if emote
                .theme_mode
                .iter()
                .any(|value| value.eq_ignore_ascii_case("light"))
            {
                "light"
            } else {
                "dark"
            };

            let scale = if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("3.0"))
            {
                "3.0"
            } else if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("2.0"))
            {
                "2.0"
            } else if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("1.0"))
            {
                "1.0"
            } else {
                "3.0"
            };

            return Some(format!(
                "https://static-cdn.jtvnw.net/emoticons/v2/{}/{}/{}/{}",
                emote.id, format, theme_mode, scale
            ));
        }
    }

    let url = if !emote.images.url_4x.is_empty() {
        emote.images.url_4x.clone()
    } else if !emote.images.url_2x.is_empty() {
        emote.images.url_2x.clone()
    } else {
        emote.images.url_1x.clone()
    };
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

async fn load_twitch_runtime(state: &SharedState) -> Option<TwitchRuntime> {
    let (client_id, client_secret, broadcaster_id, server_port) = {
        let config = state.config().await;
        (
            config.client_id.clone(),
            config.client_secret.clone(),
            config.twitch_user_id.clone(),
            config.server_port,
        )
    };

    if client_id.is_empty() || client_secret.is_empty() || broadcaster_id.is_empty() {
        return None;
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        Ok(None) => return None,
        Err(e) => {
            tracing::warn!("Failed to load twitch token for emote API: {e}");
            return None;
        }
    };

    let current_token = Token {
        access_token: db_token.access_token.clone(),
        refresh_token: db_token.refresh_token.clone(),
        scope: db_token.scope.clone(),
        expires_at: db_token.expires_at,
    };

    let redirect_uri = format!("http://127.0.0.1:{server_port}/callback");
    let auth = TwitchAuth::new(client_id.clone(), client_secret, redirect_uri);
    let token = match auth.get_or_refresh_token(&current_token).await {
        Ok(Some(refreshed)) => {
            let db_tok = overlay_db::tokens::Token {
                access_token: refreshed.access_token.clone(),
                refresh_token: refreshed.refresh_token.clone(),
                scope: refreshed.scope.clone(),
                expires_at: refreshed.expires_at,
            };
            if let Err(e) = state.db().save_token(&db_tok) {
                tracing::warn!("Failed to save refreshed token for emote API: {e}");
            }
            refreshed
        }
        Ok(None) => current_token,
        Err(e) => {
            tracing::warn!("Failed to refresh twitch token for emote API: {e}");
            return None;
        }
    };

    Some(TwitchRuntime {
        client_id,
        broadcaster_id,
        token,
    })
}

async fn resolve_owner_channels(
    api: &TwitchApiClient,
    token: &Token,
    emotes: &[Emote],
) -> (
    HashMap<String, String>,
    HashMap<String, String>,
    HashMap<String, String>,
) {
    let mut owner_ids = Vec::new();
    let mut seen_owner_ids = HashSet::new();
    for emote in emotes {
        let Some(owner_id) = emote
            .owner_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()))
        else {
            continue;
        };
        if seen_owner_ids.insert(owner_id.to_string()) {
            owner_ids.push(owner_id.to_string());
        }
    }

    let mut owner_login_by_id: HashMap<String, String> = HashMap::new();
    let mut owner_display_name_by_login: HashMap<String, String> = HashMap::new();
    let mut owner_avatar_url_by_login: HashMap<String, String> = HashMap::new();
    if owner_ids.is_empty() {
        return (
            owner_login_by_id,
            owner_display_name_by_login,
            owner_avatar_url_by_login,
        );
    }

    for chunk in owner_ids.chunks(100) {
        let chunk_ids = chunk.to_vec();
        match api.get_users_by_ids(token, &chunk_ids).await {
            Ok(users) => {
                for user in users {
                    let id = user.id.trim();
                    let Some(login) = normalize_channel_login(&user.login) else {
                        continue;
                    };
                    if id.is_empty() {
                        continue;
                    }
                    owner_login_by_id.insert(id.to_string(), login.clone());
                    let display_name = user.display_name.trim();
                    if !display_name.is_empty() {
                        owner_display_name_by_login
                            .entry(login.clone())
                            .or_insert_with(|| display_name.to_string());
                    }
                    let avatar_url = user.profile_image_url.trim();
                    if !avatar_url.is_empty() {
                        owner_avatar_url_by_login
                            .entry(login)
                            .or_insert_with(|| avatar_url.to_string());
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to resolve owner users for emote API in batch (count={}): {e}",
                    chunk_ids.len()
                );
                // Fallback: retry per ID so one problematic value doesn't drop the whole chunk.
                for owner_id in chunk_ids {
                    match api.get_users_by_ids(token, std::slice::from_ref(&owner_id)).await {
                        Ok(users) => {
                            for user in users {
                                let id = user.id.trim();
                                let Some(login) = normalize_channel_login(&user.login) else {
                                    continue;
                                };
                                if id.is_empty() {
                                    continue;
                                }
                                owner_login_by_id.insert(id.to_string(), login.clone());
                                let display_name = user.display_name.trim();
                                if !display_name.is_empty() {
                                    owner_display_name_by_login
                                        .entry(login.clone())
                                        .or_insert_with(|| display_name.to_string());
                                }
                                let avatar_url = user.profile_image_url.trim();
                                if !avatar_url.is_empty() {
                                    owner_avatar_url_by_login
                                        .entry(login)
                                        .or_insert_with(|| avatar_url.to_string());
                                }
                            }
                        }
                        Err(inner) => {
                            tracing::debug!(
                                owner_id = %owner_id,
                                "Failed to resolve owner id in fallback lookup: {inner}"
                            );
                        }
                    }
                }
            }
        }
    }

    (
        owner_login_by_id,
        owner_display_name_by_login,
        owner_avatar_url_by_login,
    )
}

async fn load_cached_user_emotes(
    api: &TwitchApiClient,
    cache: &EmoteCache,
    token: &Token,
    user_id: &str,
    force_refresh: bool,
) -> Option<UserEmoteCacheEntry> {
    let now = Instant::now();
    if !force_refresh {
        let guard = match user_emote_cache_map().lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(entry) = guard.get(user_id) {
            if now.duration_since(entry.cached_at) <= USER_EMOTE_CACHE_TTL {
                return Some(entry.clone());
            }
        }
    }

    let emotes = match cache.get_user_emotes(token, user_id).await {
        Ok(emotes) => emotes,
        Err(e) => {
            tracing::warn!("Failed to fetch usable user emotes for emote API (user_id={user_id}): {e}");
            return None;
        }
    };

    let (owner_login_by_id, owner_display_name_by_login, owner_avatar_url_by_login) =
        resolve_owner_channels(api, token, &emotes).await;
    let entry = UserEmoteCacheEntry {
        cached_at: now,
        emotes,
        owner_login_by_id,
        owner_display_name_by_login,
        owner_avatar_url_by_login,
    };

    let mut guard = match user_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    guard.insert(user_id.to_string(), entry.clone());
    Some(entry)
}

fn read_cached_user_emotes_if_fresh(user_id: &str) -> Option<UserEmoteCacheEntry> {
    let now = Instant::now();
    let guard = match user_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let entry = guard.get(user_id)?;
    if now.duration_since(entry.cached_at) <= USER_EMOTE_CACHE_TTL {
        Some(entry.clone())
    } else {
        None
    }
}

async fn load_cached_channel_emotes(
    cache: &EmoteCache,
    token: &Token,
    broadcaster_id: &str,
    force_refresh: bool,
) -> Option<Vec<Emote>> {
    let now = Instant::now();
    if !force_refresh {
        let guard = match channel_emote_cache_map().lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(entry) = guard.get(broadcaster_id) {
            if now.duration_since(entry.cached_at) <= CHANNEL_EMOTE_CACHE_TTL {
                return Some(entry.emotes.clone());
            }
        }
    }

    let emotes = match cache.get_channel_emotes(token, broadcaster_id).await {
        Ok(emotes) => emotes,
        Err(e) => {
            tracing::warn!(
                broadcaster_id,
                "Failed to fetch channel emotes for emote API cache: {e}"
            );
            return None;
        }
    };

    let entry = ChannelEmoteCacheEntry {
        cached_at: now,
        emotes: emotes.clone(),
    };
    let mut guard = match channel_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    guard.insert(broadcaster_id.to_string(), entry);

    Some(emotes)
}

fn push_grouped_emote(groups: &mut HashMap<String, EmoteGroup>, item: EmoteItem) {
    let (group_id, label, source, channel_login) = match &item.source {
        EmoteSource::Channel => {
            let login = item.channel_login.clone().unwrap_or_else(|| "unknown".to_string());
            (
                format!("channel:{login}"),
                format!("#{login}"),
                EmoteSource::Channel,
                Some(login),
            )
        }
        EmoteSource::Special => (
            item.channel_login
                .as_ref()
                .map(|login| format!("special:{login}"))
                .unwrap_or_else(|| "special".to_string()),
            item.channel_login
                .as_ref()
                .map(|login| format!("#{login}"))
                .unwrap_or_else(|| "特殊".to_string()),
            EmoteSource::Special,
            item.channel_login.clone(),
        ),
        EmoteSource::Unlocked => (
            "unlocked".to_string(),
            "アンロック済み".to_string(),
            EmoteSource::Unlocked,
            None,
        ),
        EmoteSource::Global => (
            "global".to_string(),
            "グローバル".to_string(),
            EmoteSource::Global,
            None,
        ),
    };

    let group = groups.entry(group_id.clone()).or_insert_with(|| EmoteGroup {
        id: group_id,
        label,
        source,
        channel_login,
        channel_avatar_url: None,
        priority: false,
        emotes: Vec::new(),
    });

    merge_emote_into_group(group, item);
}

fn merge_emote_into_group(group: &mut EmoteGroup, item: EmoteItem) {
    if let Some(current) = group.emotes.iter_mut().find(|current| {
        if !item.id.is_empty() && !current.id.is_empty() {
            return current.id == item.id;
        }
        current.name == item.name && current.url == item.url
    }) {
        current.usable = current.usable || item.usable;
        if current.emote_type.is_none() {
            current.emote_type = item.emote_type;
        }
        if current.tier.is_none() {
            current.tier = item.tier;
        }
        return;
    }
    group.emotes.push(item);
}

fn merge_special_groups_into_channel(groups: &mut HashMap<String, EmoteGroup>) {
    let special_keys: Vec<String> = groups
        .keys()
        .filter(|key| key.starts_with("special:"))
        .cloned()
        .collect();
    for special_key in special_keys {
        let Some(special_group) = groups.remove(&special_key) else {
            continue;
        };
        let Some(login) = special_group.channel_login.clone() else {
            groups.insert(special_key, special_group);
            continue;
        };
        let channel_key = format!("channel:{login}");
        if let Some(channel_group) = groups.get_mut(&channel_key) {
            for emote in special_group.emotes {
                merge_emote_into_group(channel_group, emote);
            }
        } else {
            groups.insert(special_key, special_group);
        }
    }
}

fn is_special_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "bitstier"
            | "bits_tier"
            | "hypetrain"
            | "hype_train"
            | "limitedtime"
            | "limited_time"
            | "reward"
            | "rewards"
    )
}

fn is_unlocked_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "follower"
            | "followers"
            | "channel_points"
            | "channelpoints"
            | "unlock"
            | "unlocked"
            | "prime"
            | "turbo"
            | "twofactor"
    )
}

fn is_channel_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "subscriptions"
            | "subscription"
            | "subscriber"
            | "subscribers"
            | "follower"
            | "followers"
    )
}

fn resolve_emote_source(channel_login: Option<&str>, emote_type: Option<&str>) -> EmoteSource {
    if channel_login.is_some() && is_channel_emote_type(emote_type) {
        return EmoteSource::Channel;
    }
    if channel_login.is_some() && is_special_emote_type(emote_type) {
        return EmoteSource::Special;
    }
    if is_unlocked_emote_type(emote_type) {
        return EmoteSource::Unlocked;
    }
    if channel_login.is_none() && is_special_emote_type(emote_type) {
        return EmoteSource::Unlocked;
    }
    if channel_login.is_some() {
        return EmoteSource::Channel;
    }
    EmoteSource::Global
}

fn sort_group_emotes(group: &mut EmoteGroup) {
    // Keep channel groups in API insertion order.
    // For the active channel this should align with Twitch's own picker ordering.
    if matches!(group.source, EmoteSource::Channel) {
        return;
    }

    fn normalized_emote_type(emote_type: Option<&str>) -> String {
        emote_type
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .replace(['-', ' '], "_")
    }

    fn tier_bucket(tier: Option<&str>) -> u8 {
        match tier
            .and_then(|value| value.trim().parse::<i32>().ok())
            .unwrap_or_default()
        {
            1000 => 1,
            2000 => 2,
            3000 => 3,
            _ => 4,
        }
    }

    fn emote_order_rank(emote_type: Option<&str>, tier: Option<&str>) -> u8 {
        let normalized = normalized_emote_type(emote_type);
        if matches!(normalized.as_str(), "follower" | "followers") {
            return 0;
        }
        if matches!(
            normalized.as_str(),
            "subscriptions" | "subscription" | "subscriber" | "subscribers"
        ) {
            return tier_bucket(tier);
        }
        if matches!(
            normalized.as_str(),
            "bitstier"
                | "bits_tier"
                | "reward"
                | "rewards"
                | "channel_points"
                | "channelpoints"
                | "hypetrain"
                | "hype_train"
                | "limitedtime"
                | "limited_time"
                | "unlock"
                | "unlocked"
                | "prime"
                | "turbo"
                | "twofactor"
        ) {
            return 5;
        }
        6
    }

    group.emotes.sort_by(|a, b| {
        b.usable
            .cmp(&a.usable)
            .then_with(|| {
                emote_order_rank(a.emote_type.as_deref(), a.tier.as_deref())
                    .cmp(&emote_order_rank(b.emote_type.as_deref(), b.tier.as_deref()))
            })
    });
}

fn source_priority(source: &EmoteSource) -> u8 {
    match source {
        EmoteSource::Channel => 0,
        EmoteSource::Special => 1,
        EmoteSource::Unlocked => 2,
        EmoteSource::Global => 3,
    }
}

/// GET /api/emotes?channels=foo,bar&priority_channel=baz
pub async fn get_emotes(
    State(state): State<SharedState>,
    Query(query): Query<EmotesQuery>,
) -> ApiResult {
    let force_refresh = query.refresh.unwrap_or(false);
    let requested_channels = parse_channel_logins_csv(query.channels.as_deref());
    let priority_channel = query
        .priority_channel
        .as_deref()
        .and_then(normalize_channel_login);

    let Some(runtime) = load_twitch_runtime(&state).await else {
        return Ok(Json(json!({
            "status": "ok",
            "data": {
                "groups": [],
                "emotes": [],
            }
        })));
    };

    let api = TwitchApiClient::new(runtime.client_id.clone());
    let cache = EmoteCache::new(runtime.client_id.clone());
    let authenticated_user = match api.get_current_user(&runtime.token).await {
        Ok(user) => Some(user),
        Err(e) => {
            tracing::warn!("Failed to resolve authenticated user for emote API: {e}");
            None
        }
    };
    let emote_user_id = authenticated_user
        .as_ref()
        .map(|user| user.id.clone())
        .unwrap_or_else(|| runtime.broadcaster_id.clone());

    let runtime_broadcaster = match api.get_user(&runtime.token, &runtime.broadcaster_id).await {
        Ok(user) => normalize_channel_login(&user.login).map(|login| {
            (
                login,
                user.display_name,
                user.profile_image_url,
            )
        }),
        Err(e) => {
            tracing::warn!("Failed to resolve runtime broadcaster login for emote API: {e}");
            None
        }
    };
    let runtime_broadcaster_login = runtime_broadcaster
        .as_ref()
        .map(|(login, _, _)| login.clone());
    let mut channel_broadcaster_ids: HashMap<String, String> = HashMap::new();
    if let Some(login) = runtime_broadcaster_login.as_ref() {
        channel_broadcaster_ids.insert(login.clone(), runtime.broadcaster_id.clone());
    }
    let mut channel_display_names: HashMap<String, String> = HashMap::new();
    let mut channel_avatar_urls: HashMap<String, String> = HashMap::new();
    if let Some((login, display_name, profile_image_url)) = &runtime_broadcaster {
        let name = display_name.trim();
        if !name.is_empty() {
            channel_display_names.insert(login.clone(), name.to_string());
        }
        let avatar_url = profile_image_url.trim();
        if !avatar_url.is_empty() {
            channel_avatar_urls.insert(login.clone(), avatar_url.to_string());
        }
    }

    let user_emotes_scope_available = token_has_scope(&runtime.token.scope, "user:read:emotes");
    let mut user_emote_reason: Option<&'static str> = None;

    let mut user_emote_entry = if user_emotes_scope_available {
        load_cached_user_emotes(
            &api,
            &cache,
            &runtime.token,
            &emote_user_id,
            force_refresh,
        )
        .await
    } else {
        user_emote_reason = Some("missing_scope:user:read:emotes");
        read_cached_user_emotes_if_fresh(&emote_user_id)
    };
    let base_user_emote_ids = user_emote_entry.as_ref().map(|entry| {
        entry
            .emotes
            .iter()
            .map(|emote| emote.id.clone())
            .collect::<HashSet<String>>()
    });
    let mut supplemental_user_emote_channels = Vec::new();
    let mut seen_supplemental_channels = HashSet::new();
    if let Some(channel) = priority_channel.clone() {
        if seen_supplemental_channels.insert(channel.clone()) {
            supplemental_user_emote_channels.push(channel);
        }
    }
    for channel in &requested_channels {
        if seen_supplemental_channels.insert(channel.clone()) {
            supplemental_user_emote_channels.push(channel.clone());
        }
    }
    if supplemental_user_emote_channels.is_empty() {
        if let Some(login) = runtime_broadcaster_login.clone() {
            if seen_supplemental_channels.insert(login.clone()) {
                supplemental_user_emote_channels.push(login);
            }
        }
    }

    if let Some(entry) = user_emote_entry.as_mut() {
        let mut additional_emotes = Vec::new();
        for channel_login in supplemental_user_emote_channels {
            let broadcaster_id = if let Some(id) = channel_broadcaster_ids.get(&channel_login) {
                Some(id.clone())
            } else {
                match api.get_user_by_login(&runtime.token, &channel_login).await {
                    Ok(user) => {
                        let display_name = user.display_name.trim();
                        if !display_name.is_empty() {
                            channel_display_names
                                .entry(channel_login.clone())
                                .or_insert_with(|| display_name.to_string());
                        }
                        let avatar_url = user.profile_image_url.trim();
                        if !avatar_url.is_empty() {
                            channel_avatar_urls
                                .entry(channel_login.clone())
                                .or_insert_with(|| avatar_url.to_string());
                        }
                        channel_broadcaster_ids.insert(channel_login.clone(), user.id.clone());
                        Some(user.id)
                    }
                    Err(e) => {
                        tracing::warn!(
                            channel_login,
                            "Failed to resolve broadcaster id for user emote API: {e}"
                        );
                        None
                    }
                }
            };

            let Some(broadcaster_id) = broadcaster_id else {
                continue;
            };

            match cache
                .get_user_emotes_for_broadcaster(&runtime.token, &emote_user_id, &broadcaster_id)
                .await
            {
                Ok(mut emotes) => additional_emotes.append(&mut emotes),
                Err(e) => {
                    tracing::warn!(
                        channel_login,
                        "Failed to fetch broadcaster-scoped user emotes: {e}"
                    );
                }
            }
        }

        if !additional_emotes.is_empty() {
            let (owner_login_by_id, owner_display_name_by_login, owner_avatar_url_by_login) =
                resolve_owner_channels(&api, &runtime.token, &additional_emotes).await;
            for (owner_id, owner_login) in owner_login_by_id {
                entry.owner_login_by_id.entry(owner_id).or_insert(owner_login);
            }
            for (owner_login, owner_display_name) in owner_display_name_by_login {
                channel_display_names
                    .entry(owner_login.clone())
                    .or_insert_with(|| owner_display_name.clone());
                entry
                    .owner_display_name_by_login
                    .entry(owner_login)
                    .or_insert(owner_display_name);
            }
            for (owner_login, owner_avatar_url) in owner_avatar_url_by_login {
                channel_avatar_urls
                    .entry(owner_login.clone())
                    .or_insert_with(|| owner_avatar_url.clone());
                entry
                    .owner_avatar_url_by_login
                    .entry(owner_login)
                    .or_insert(owner_avatar_url);
            }

            let mut seen_emote_ids = entry
                .emotes
                .iter()
                .map(|emote| emote.id.clone())
                .collect::<HashSet<String>>();
            for emote in additional_emotes {
                if seen_emote_ids.insert(emote.id.clone()) {
                    entry.emotes.push(emote);
                }
            }
        }
    }
    let user_emotes_available = user_emote_entry.is_some();

    let mut target_channels = Vec::new();
    let mut seen_channels = HashSet::new();
    if let Some(channel) = priority_channel.clone() {
        if seen_channels.insert(channel.clone()) {
            target_channels.push(channel);
        }
    }
    // Always fetch the runtime broadcaster's channel emotes as well so
    // self-channel groups keep accurate tier metadata even when another
    // channel is currently active.
    if let Some(login) = runtime_broadcaster_login.clone() {
        if seen_channels.insert(login.clone()) {
            target_channels.push(login);
        }
    }
    if let Some(entry) = user_emote_entry.as_ref() {
        for owner_login in entry.owner_login_by_id.values() {
            if seen_channels.insert(owner_login.clone()) {
                target_channels.push(owner_login.clone());
            }
        }
    }
    if !user_emotes_available {
        for channel in requested_channels {
            if seen_channels.insert(channel.clone()) {
                target_channels.push(channel);
            }
        }
    }

    let mut groups_by_id: HashMap<String, EmoteGroup> = HashMap::new();
    let usable_emote_ids = user_emote_entry.as_ref().map(|entry| {
        entry
            .emotes
            .iter()
            .map(|emote| emote.id.clone())
            .collect::<HashSet<String>>()
    });

    let resolve_usable = |source: EmoteSource,
                          channel_login: Option<&str>,
                          emote_id: &str,
                          emote_type: Option<&str>|
     -> bool {
        if let Some(ids) = usable_emote_ids.as_ref() {
            if !ids.contains(emote_id) {
                return false;
            }

            if matches!(source, EmoteSource::Channel) {
                let normalized_type = emote_type.unwrap_or("").trim().to_ascii_lowercase();
                if matches!(normalized_type.as_str(), "follower" | "followers") {
                    let is_globally_usable = base_user_emote_ids
                        .as_ref()
                        .map(|base_ids| base_ids.contains(emote_id))
                        .unwrap_or(false);
                    if is_globally_usable {
                        return true;
                    }
                    let active_channel = priority_channel
                        .as_deref()
                        .or(runtime_broadcaster_login.as_deref());
                    return active_channel
                        .zip(channel_login)
                        .map(|(active, login)| active == login)
                        .unwrap_or(false);
                }
            }
            return true;
        }

        match source {
            EmoteSource::Special | EmoteSource::Unlocked | EmoteSource::Global => true,
            EmoteSource::Channel => {
                let Some(login) = channel_login else {
                    return true;
                };

                let is_runtime_channel = runtime_broadcaster_login
                    .as_deref()
                    .map(|runtime_login| runtime_login == login)
                    .unwrap_or(false);
                if is_runtime_channel {
                    return true;
                }

                // Fallback when usable-emote resolution is unavailable:
                // lock only subscription-type emotes in the current (priority) channel,
                // and avoid false-locking follower/free emotes.
                let is_priority_channel = priority_channel
                    .as_deref()
                    .map(|priority| priority == login)
                    .unwrap_or(false);
                if !is_priority_channel {
                    return true;
                }

                let normalized_type = emote_type.unwrap_or("").trim().to_ascii_lowercase();
                !matches!(
                    normalized_type.as_str(),
                    "subscriptions" | "subscription" | "subscriber" | "subscribers"
                )
            }
        }
    };

    if let Some(entry) = user_emote_entry.as_ref() {
        for (login, display_name) in &entry.owner_display_name_by_login {
            channel_display_names
                .entry(login.clone())
                .or_insert_with(|| display_name.clone());
        }
        for (login, avatar_url) in &entry.owner_avatar_url_by_login {
            channel_avatar_urls
                .entry(login.clone())
                .or_insert_with(|| avatar_url.clone());
        }
        for (owner_id, owner_login) in &entry.owner_login_by_id {
            channel_broadcaster_ids
                .entry(owner_login.clone())
                .or_insert_with(|| owner_id.clone());
        }

        for emote in &entry.emotes {
            if emote.name.is_empty() {
                continue;
            }
            let Some(url) = emote_url_from_images(emote) else {
                continue;
            };
            let channel_login = emote
                .owner_id
                .as_deref()
                .and_then(|owner_id| entry.owner_login_by_id.get(owner_id))
                .cloned();
            let source = resolve_emote_source(channel_login.as_deref(), emote.emote_type.as_deref());

            // Prefer broadcaster-scoped `/chat/emotes` ordering for the active channel.
            // We skip early insertion from `/chat/emotes/user` and let the later
            // channel fetch append in official order.
            if matches!(source, EmoteSource::Channel)
                && channel_login
                    .as_ref()
                    .zip(priority_channel.as_ref())
                    .map(|(owner, active)| owner == active)
                    .unwrap_or(false)
            {
                continue;
            }

            let usable = resolve_usable(
                source,
                channel_login.as_deref(),
                &emote.id,
                emote.emote_type.as_deref(),
            );
            push_grouped_emote(
                &mut groups_by_id,
                EmoteItem {
                    id: emote.id.clone(),
                    name: emote.name.clone(),
                    url,
                    source,
                    channel_login,
                    usable,
                    emote_type: emote.emote_type.clone(),
                    tier: emote.tier.clone(),
                },
            );
        }
    }

    if user_emote_entry.is_none() {
        match cache.get_global_emotes(&runtime.token).await {
            Ok(emotes) => {
                for emote in emotes {
                    if emote.name.is_empty() {
                        continue;
                    }
                    let Some(url) = emote_url_from_images(&emote) else {
                        continue;
                    };
                    let usable = resolve_usable(
                        EmoteSource::Global,
                        None,
                        &emote.id,
                        emote.emote_type.as_deref(),
                    );
                    push_grouped_emote(
                        &mut groups_by_id,
                        EmoteItem {
                            id: emote.id,
                            name: emote.name,
                            url,
                            source: EmoteSource::Global,
                            channel_login: None,
                            usable,
                            emote_type: emote.emote_type,
                            tier: emote.tier,
                        },
                    );
                }
            }
            Err(e) => tracing::warn!("Failed to fetch global emotes for emote API: {e}"),
        }
    }

    for channel_login in target_channels {
        let broadcaster_id = if runtime_broadcaster_login.as_ref() == Some(&channel_login) {
            Some(runtime.broadcaster_id.clone())
        } else if let Some(id) = channel_broadcaster_ids.get(&channel_login) {
            Some(id.clone())
        } else {
            match api.get_user_by_login(&runtime.token, &channel_login).await {
                Ok(user) => {
                    let display_name = user.display_name.trim();
                    if !display_name.is_empty() {
                        channel_display_names
                            .entry(channel_login.clone())
                            .or_insert_with(|| display_name.to_string());
                    }
                    let avatar_url = user.profile_image_url.trim();
                    if !avatar_url.is_empty() {
                        channel_avatar_urls
                            .entry(channel_login.clone())
                            .or_insert_with(|| avatar_url.to_string());
                    }
                    channel_broadcaster_ids.insert(channel_login.clone(), user.id.clone());
                    Some(user.id)
                }
                Err(e) => {
                    tracing::warn!(channel_login, "Failed to resolve broadcaster id for emote API: {e}");
                    None
                }
            }
        };

        let Some(broadcaster_id) = broadcaster_id else {
            continue;
        };

        let Some(emotes) = load_cached_channel_emotes(
            &cache,
            &runtime.token,
            &broadcaster_id,
            force_refresh,
        )
        .await
        else {
            continue;
        };
        for emote in emotes {
            if emote.name.is_empty() {
                continue;
            }
            let Some(url) = emote_url_from_images(&emote) else {
                continue;
            };
            let source =
                resolve_emote_source(Some(channel_login.as_str()), emote.emote_type.as_deref());
            let usable = resolve_usable(
                source,
                Some(channel_login.as_str()),
                &emote.id,
                emote.emote_type.as_deref(),
            );
            push_grouped_emote(
                &mut groups_by_id,
                EmoteItem {
                    id: emote.id,
                    name: emote.name,
                    url,
                    source,
                    channel_login: Some(channel_login.clone()),
                    usable,
                    emote_type: emote.emote_type,
                    tier: emote.tier,
                },
            );
        }
    }

    merge_special_groups_into_channel(&mut groups_by_id);
    let mut groups: Vec<EmoteGroup> = groups_by_id.into_values().collect();

    for group in &mut groups {
        if let Some(channel_login) = group.channel_login.as_ref() {
            let display_name = channel_display_names
                .get(channel_login)
                .map(|name| name.trim())
                .filter(|name| !name.is_empty())
                .map(|name| name.to_string())
                .unwrap_or_else(|| format!("#{channel_login}"));
            group.label = display_name;
            let avatar_url = channel_avatar_urls
                .get(channel_login)
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());
            group.channel_avatar_url = avatar_url;
        }
        group.priority = matches!(group.source, EmoteSource::Channel)
            && group
                .channel_login
                .as_ref()
                .zip(priority_channel.as_ref())
                .map(|(group_channel, priority)| group_channel == priority)
                .unwrap_or(false);
        sort_group_emotes(group);
    }

    let priority_login = priority_channel.as_deref();
    groups.sort_by(|a, b| {
        let rank = |group: &EmoteGroup| -> u8 {
            if matches!(group.source, EmoteSource::Channel)
                && group.channel_login.as_deref() == priority_login
            {
                return 0;
            }
            source_priority(&group.source) + 1
        };
        let sort_key = |group: &EmoteGroup| -> String {
            group
                .channel_login
                .as_deref()
                .map(|login| login.to_ascii_lowercase())
                .unwrap_or_else(|| group.label.to_ascii_lowercase())
        };

        rank(a)
            .cmp(&rank(b))
            .then_with(|| sort_key(a).cmp(&sort_key(b)))
    });

    let emotes: Vec<EmoteItem> = groups
        .iter()
        .flat_map(|group| group.emotes.iter().cloned())
        .collect();

    let mut meta = serde_json::Map::new();
    meta.insert("user_emotes_available".to_string(), json!(user_emotes_available));
    if let Some(reason) = user_emote_reason {
        meta.insert("user_emotes_reason".to_string(), json!(reason));
    }

    Ok(Json(json!({
        "status": "ok",
        "data": {
            "groups": groups,
            "emotes": emotes,
        }
        ,
        "meta": meta
    })))
}
