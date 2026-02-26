//! Twitch emote cache.
//!
//! Fetches and caches global and per-channel emotes from the
//! Twitch Helix API so they can be resolved by emote ID.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{Token, TwitchError};

const HELIX_BASE: &str = "https://api.twitch.tv/helix";

// ---------------------------------------------------------------------------
// Emote types
// ---------------------------------------------------------------------------

/// A single Twitch emote with image URLs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Emote {
    pub id: String,
    pub name: String,
    // `chat/emotes/user` doesn't include `images`; use id/format/template-derived URL instead.
    #[serde(default)]
    pub images: EmoteImages,
    #[serde(default)]
    pub emote_type: Option<String>,
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub format: Vec<String>,
    #[serde(default)]
    pub scale: Vec<String>,
    #[serde(default)]
    pub theme_mode: Vec<String>,
}

/// Image URLs at different scales.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EmoteImages {
    pub url_1x: String,
    pub url_2x: String,
    pub url_4x: String,
}

/// Helix response wrapper for emotes.
#[derive(Debug, Deserialize)]
struct EmoteResponse {
    data: Vec<Emote>,
}

#[derive(Debug, Deserialize)]
struct EmotePagination {
    #[serde(default)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EmotePaginatedResponse {
    data: Vec<Emote>,
    #[serde(default)]
    pagination: Option<EmotePagination>,
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/// In-memory cache for global and channel emotes.
///
/// Emotes are indexed by emote ID for fast lookup.
pub struct EmoteCache {
    client_id: String,
    http: reqwest::Client,
    /// Emote ID -> Emote mapping.
    emotes: HashMap<String, Emote>,
}

impl EmoteCache {
    /// Create a new empty emote cache.
    pub fn new(client_id: String) -> Self {
        Self {
            client_id,
            http: reqwest::Client::new(),
            emotes: HashMap::new(),
        }
    }

    /// Look up an emote by ID.
    pub fn get(&self, emote_id: &str) -> Option<&Emote> {
        self.emotes.get(emote_id)
    }

    /// Number of cached emotes.
    pub fn len(&self) -> usize {
        self.emotes.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.emotes.is_empty()
    }

    /// Fetch global emotes from Twitch.
    pub async fn get_global_emotes(&self, token: &Token) -> Result<Vec<Emote>, TwitchError> {
        let url = format!("{HELIX_BASE}/chat/emotes/global");
        let body = self.fetch(&url, token).await?;
        let resp: EmoteResponse = serde_json::from_str(&body)?;
        tracing::debug!(count = resp.data.len(), "Fetched global emotes");
        Ok(resp.data)
    }

    /// Fetch channel-specific emotes from Twitch.
    pub async fn get_channel_emotes(
        &self,
        token: &Token,
        broadcaster_id: &str,
    ) -> Result<Vec<Emote>, TwitchError> {
        let url = format!("{HELIX_BASE}/chat/emotes?broadcaster_id={broadcaster_id}");
        let body = self.fetch(&url, token).await?;
        let resp: EmoteResponse = serde_json::from_str(&body)?;
        tracing::debug!(
            count = resp.data.len(),
            broadcaster_id,
            "Fetched channel emotes"
        );
        Ok(resp.data)
    }

    /// Fetch user-usable emotes for the authenticated user.
    ///
    /// This includes global emotes and channel emotes available to that user.
    pub async fn get_user_emotes(
        &self,
        token: &Token,
        user_id: &str,
    ) -> Result<Vec<Emote>, TwitchError> {
        self.get_user_emotes_paginated(token, user_id, None).await
    }

    /// Fetch user-usable emotes for a specific broadcaster context.
    ///
    /// Passing `broadcaster_id` guarantees inclusion of follower emotes for that broadcaster.
    pub async fn get_user_emotes_for_broadcaster(
        &self,
        token: &Token,
        user_id: &str,
        broadcaster_id: &str,
    ) -> Result<Vec<Emote>, TwitchError> {
        self.get_user_emotes_paginated(token, user_id, Some(broadcaster_id))
            .await
    }

    async fn get_user_emotes_paginated(
        &self,
        token: &Token,
        user_id: &str,
        broadcaster_id: Option<&str>,
    ) -> Result<Vec<Emote>, TwitchError> {
        let mut out = Vec::new();
        let mut after: Option<String> = None;

        loop {
            let mut url = format!("{HELIX_BASE}/chat/emotes/user?user_id={user_id}&first=100");
            if let Some(id) = broadcaster_id.filter(|id| !id.is_empty()) {
                url.push_str("&broadcaster_id=");
                url.push_str(id);
            }
            if let Some(cursor) = after.as_ref().filter(|cursor| !cursor.is_empty()) {
                url.push_str("&after=");
                url.push_str(cursor);
            }

            let body = self.fetch(&url, token).await?;
            let resp: EmotePaginatedResponse = serde_json::from_str(&body)?;
            out.extend(resp.data);

            let next_cursor = resp
                .pagination
                .and_then(|p| p.cursor)
                .filter(|cursor| !cursor.is_empty());
            if let Some(cursor) = next_cursor {
                after = Some(cursor);
            } else {
                break;
            }
        }

        Ok(out)
    }

    /// Refresh the cache by loading both global and channel emotes.
    ///
    /// Existing entries are replaced.
    pub async fn refresh_cache(
        &mut self,
        token: &Token,
        broadcaster_id: &str,
    ) -> Result<(), TwitchError> {
        let mut new_emotes = HashMap::new();

        // Fetch global emotes
        match self.get_global_emotes(token).await {
            Ok(emotes) => {
                for emote in emotes {
                    new_emotes.insert(emote.id.clone(), emote);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to fetch global emotes");
            }
        }

        // Fetch channel emotes
        match self.get_channel_emotes(token, broadcaster_id).await {
            Ok(emotes) => {
                for emote in emotes {
                    new_emotes.insert(emote.id.clone(), emote);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to fetch channel emotes");
            }
        }

        let count = new_emotes.len();
        self.emotes = new_emotes;
        tracing::info!(count, "Emote cache refreshed");
        Ok(())
    }

    /// Send an authenticated GET request to the Twitch API.
    async fn fetch(&self, url: &str, token: &Token) -> Result<String, TwitchError> {
        let resp = self
            .http
            .get(url)
            .header("Authorization", format!("Bearer {}", token.access_token))
            .header("Client-Id", &self.client_id)
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            return Err(TwitchError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_emote_cache_lookup() {
        let mut cache = EmoteCache::new("test".into());
        assert!(cache.is_empty());

        cache.emotes.insert(
            "123".into(),
            Emote {
                id: "123".into(),
                name: "Kappa".into(),
                images: EmoteImages {
                    url_1x: "https://example.com/1x".into(),
                    url_2x: "https://example.com/2x".into(),
                    url_4x: "https://example.com/4x".into(),
                },
                emote_type: None,
                tier: None,
                owner_id: None,
                format: vec![],
                scale: vec![],
                theme_mode: vec![],
            },
        );

        assert_eq!(cache.len(), 1);
        let emote = cache.get("123").unwrap();
        assert_eq!(emote.name, "Kappa");
        assert!(cache.get("999").is_none());
    }

    #[test]
    fn test_user_emote_response_without_images_deserializes() {
        let body = r#"{
            "data": [
                {
                    "id": "301590448",
                    "name": "HeyGuys",
                    "format": ["static"],
                    "scale": ["1.0","2.0","3.0"],
                    "theme_mode": ["light","dark"],
                    "emote_type": "subscriptions",
                    "emote_set_id": "0",
                    "owner_id": "141981764"
                }
            ],
            "template": "https://static-cdn.jtvnw.net/emoticons/v2/{id}/{format}/{theme_mode}/{scale}",
            "pagination": {}
        }"#;

        let parsed: EmotePaginatedResponse = serde_json::from_str(body).unwrap();
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].id, "301590448");
        assert_eq!(parsed.data[0].name, "HeyGuys");
        assert!(parsed.data[0].images.url_1x.is_empty());
    }
}
