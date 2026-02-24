//! Emote list API.

use std::collections::{HashMap, HashSet};

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;
use twitch_client::emotes::{Emote, EmoteCache};

use crate::app::SharedState;
use crate::services::channel_points_emote_cache;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct EmotesQuery {
    pub channels: Option<String>,
    pub priority_channel: Option<String>,
}

#[derive(Clone)]
struct TwitchRuntime {
    client_id: String,
    broadcaster_id: String,
    token: Token,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
enum EmoteSource {
    Channel,
    Global,
    Learned,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteItem {
    name: String,
    url: String,
    source: EmoteSource,
    channel_login: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct EmoteGroup {
    id: String,
    label: String,
    source: EmoteSource,
    channel_login: Option<String>,
    priority: bool,
    emotes: Vec<EmoteItem>,
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
        EmoteSource::Global => (
            "global".to_string(),
            "グローバル".to_string(),
            EmoteSource::Global,
            None,
        ),
        EmoteSource::Learned => (
            "learned".to_string(),
            "学習済み".to_string(),
            EmoteSource::Learned,
            None,
        ),
    };

    let group = groups.entry(group_id.clone()).or_insert_with(|| EmoteGroup {
        id: group_id,
        label,
        source,
        channel_login,
        priority: false,
        emotes: Vec::new(),
    });

    if group
        .emotes
        .iter()
        .any(|current| current.name == item.name && current.url == item.url)
    {
        return;
    }
    group.emotes.push(item);
}

fn sort_group_emotes(group: &mut EmoteGroup) {
    group
        .emotes
        .sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
}

fn source_order(source: &EmoteSource) -> usize {
    match source {
        EmoteSource::Channel => 0,
        EmoteSource::Global => 1,
        EmoteSource::Learned => 2,
    }
}

/// GET /api/emotes?channels=foo,bar&priority_channel=baz
pub async fn get_emotes(
    State(state): State<SharedState>,
    Query(query): Query<EmotesQuery>,
) -> ApiResult {
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

    let runtime_broadcaster = match api.get_user(&runtime.token, &runtime.broadcaster_id).await {
        Ok(user) => normalize_channel_login(&user.login).map(|login| (login, user.display_name)),
        Err(e) => {
            tracing::warn!("Failed to resolve runtime broadcaster login for emote API: {e}");
            None
        }
    };
    let runtime_broadcaster_login = runtime_broadcaster
        .as_ref()
        .map(|(login, _)| login.clone());
    let mut channel_display_names: HashMap<String, String> = HashMap::new();
    if let Some((login, display_name)) = &runtime_broadcaster {
        let name = display_name.trim();
        if !name.is_empty() {
            channel_display_names.insert(login.clone(), name.to_string());
        }
    }

    let mut target_channels = Vec::new();
    let mut seen_channels = HashSet::new();

    if let Some(login) = runtime_broadcaster_login.clone() {
        if seen_channels.insert(login.clone()) {
            target_channels.push(login);
        }
    }

    for channel in requested_channels {
        if seen_channels.insert(channel.clone()) {
            target_channels.push(channel);
        }
    }

    if let Some(channel) = priority_channel.clone() {
        if seen_channels.insert(channel.clone()) {
            target_channels.push(channel);
        }
    }

    let mut groups_by_id: HashMap<String, EmoteGroup> = HashMap::new();

    match cache.get_global_emotes(&runtime.token).await {
        Ok(emotes) => {
            for emote in emotes {
                if emote.name.is_empty() {
                    continue;
                }
                let Some(url) = emote_url_from_images(&emote) else {
                    continue;
                };
                push_grouped_emote(
                    &mut groups_by_id,
                    EmoteItem {
                        name: emote.name,
                        url,
                        source: EmoteSource::Global,
                        channel_login: None,
                    },
                );
            }
        }
        Err(e) => tracing::warn!("Failed to fetch global emotes for emote API: {e}"),
    }

    for channel_login in target_channels {
        let broadcaster_id = if runtime_broadcaster_login.as_ref() == Some(&channel_login) {
            Some(runtime.broadcaster_id.clone())
        } else {
            match api.get_user_by_login(&runtime.token, &channel_login).await {
                Ok(user) => {
                    let display_name = user.display_name.trim();
                    if !display_name.is_empty() {
                        channel_display_names
                            .entry(channel_login.clone())
                            .or_insert_with(|| display_name.to_string());
                    }
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

        match cache.get_channel_emotes(&runtime.token, &broadcaster_id).await {
            Ok(emotes) => {
                for emote in emotes {
                    if emote.name.is_empty() {
                        continue;
                    }
                    let Some(url) = emote_url_from_images(&emote) else {
                        continue;
                    };
                    push_grouped_emote(
                        &mut groups_by_id,
                        EmoteItem {
                            name: emote.name,
                            url,
                            source: EmoteSource::Channel,
                            channel_login: Some(channel_login.clone()),
                        },
                    );
                }
            }
            Err(e) => {
                tracing::warn!(channel_login, "Failed to fetch channel emotes for emote API: {e}");
            }
        }
    }

    let learned_emotes = channel_points_emote_cache::snapshot_name_map().await;
    for (name, url) in learned_emotes {
        if name.trim().is_empty() || url.trim().is_empty() {
            continue;
        }
        push_grouped_emote(
            &mut groups_by_id,
            EmoteItem {
                name,
                url,
                source: EmoteSource::Learned,
                channel_login: None,
            },
        );
    }

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
        }
        group.priority = group
            .channel_login
            .as_ref()
            .zip(priority_channel.as_ref())
            .map(|(group_channel, priority)| group_channel == priority)
            .unwrap_or(false);
        sort_group_emotes(group);
    }

    groups.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| source_order(&a.source).cmp(&source_order(&b.source)))
            .then_with(|| a.label.to_ascii_lowercase().cmp(&b.label.to_ascii_lowercase()))
    });

    let emotes: Vec<EmoteItem> = groups
        .iter()
        .flat_map(|group| group.emotes.iter().cloned())
        .collect();

    Ok(Json(json!({
        "status": "ok",
        "data": {
            "groups": groups,
            "emotes": emotes,
        }
    })))
}
