//! Helpers for channel points rendering assets (avatar + emote fragments).

use std::collections::HashMap;
use std::time::Duration;

use image::DynamicImage;
use image_engine::text::Fragment;
use reqwest::Client;
use twitch_client::Token;
use twitch_client::api::TwitchApiClient;
use twitch_client::auth::TwitchAuth;
use twitch_client::emotes::EmoteCache;

use crate::app::SharedState;
use crate::services::channel_points_emote_cache;
use crate::services::channel_points_parse::{
    ParsedPart, fetch_emote_image, parse_with_emotes, text_fragment,
};

pub async fn build_fragments_for_input(state: &SharedState, user_input: &str) -> Vec<Fragment> {
    let emote_name_map = load_emote_name_map(state).await;
    if emote_name_map.is_empty() {
        return vec![text_fragment(user_input)];
    }

    let parts = parse_with_emotes(user_input, &emote_name_map);
    if parts.is_empty() {
        return vec![text_fragment(user_input)];
    }

    let http = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok();
    let mut image_cache: HashMap<String, Option<DynamicImage>> = HashMap::new();
    let mut fragments = Vec::with_capacity(parts.len());

    for part in parts {
        match part {
            ParsedPart::Text(text) => {
                if !text.is_empty() {
                    fragments.push(text_fragment(&text));
                }
            }
            ParsedPart::Emote { name, url } => {
                let emote_image = if let Some(cached) = image_cache.get(&url) {
                    cached.clone()
                } else {
                    let fetched = match &http {
                        Some(client) => fetch_emote_image(client, &url).await,
                        None => None,
                    };
                    image_cache.insert(url.clone(), fetched.clone());
                    fetched
                };

                fragments.push(Fragment {
                    text: name,
                    is_emote: true,
                    emote_image,
                });
            }
        }
    }

    if fragments.is_empty() {
        vec![text_fragment(user_input)]
    } else {
        fragments
    }
}

pub async fn fetch_reward_avatar_url(state: &SharedState, user_id: &str) -> String {
    if user_id.trim().is_empty() {
        return String::new();
    }
    let Some(runtime) = load_twitch_runtime(state).await else {
        return String::new();
    };
    let client = TwitchApiClient::new(runtime.client_id);
    client
        .get_user_avatar(&runtime.token, user_id)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to get avatar for reward user: {e}");
            String::new()
        })
}

pub async fn fetch_debug_avatar_url(state: &SharedState) -> String {
    let Some(runtime) = load_twitch_runtime(state).await else {
        return String::new();
    };
    let client = TwitchApiClient::new(runtime.client_id);
    client
        .get_user_avatar(&runtime.token, &runtime.broadcaster_id)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to get broadcaster avatar for debug mode: {e}");
            String::new()
        })
}

#[derive(Clone)]
struct TwitchRuntime {
    client_id: String,
    broadcaster_id: String,
    token: Token,
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
            tracing::warn!("Failed to load twitch token: {e}");
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
                tracing::warn!("Failed to save refreshed token for channel points assets: {e}");
            }
            refreshed
        }
        Ok(None) => current_token,
        Err(e) => {
            tracing::warn!("Failed to refresh twitch token for channel points assets: {e}");
            return None;
        }
    };

    Some(TwitchRuntime {
        client_id,
        broadcaster_id,
        token,
    })
}

pub async fn load_emote_name_map(state: &SharedState) -> HashMap<String, String> {
    let Some(runtime) = load_twitch_runtime(state).await else {
        return HashMap::new();
    };

    let cache = EmoteCache::new(runtime.client_id);
    let mut out = HashMap::new();

    match cache.get_global_emotes(&runtime.token).await {
        Ok(emotes) => {
            for emote in emotes {
                upsert_emote_name(&mut out, emote);
            }
        }
        Err(e) => tracing::warn!("Failed to fetch global emotes: {e}"),
    }

    match cache
        .get_channel_emotes(&runtime.token, &runtime.broadcaster_id)
        .await
    {
        Ok(emotes) => {
            for emote in emotes {
                upsert_emote_name(&mut out, emote);
            }
        }
        Err(e) => tracing::warn!("Failed to fetch channel emotes: {e}"),
    }

    out.extend(channel_points_emote_cache::snapshot_name_map().await);

    out
}

fn upsert_emote_name(name_map: &mut HashMap<String, String>, emote: twitch_client::emotes::Emote) {
    let url = if !emote.images.url_4x.is_empty() {
        emote.images.url_4x
    } else if !emote.images.url_2x.is_empty() {
        emote.images.url_2x
    } else {
        emote.images.url_1x
    };
    if !emote.name.is_empty() && !url.is_empty() {
        name_map.insert(emote.name, url);
    }
}
