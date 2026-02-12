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
    pub images: EmoteImages,
    #[serde(default)]
    pub format: Vec<String>,
    #[serde(default)]
    pub scale: Vec<String>,
    #[serde(default)]
    pub theme_mode: Vec<String>,
}

/// Image URLs at different scales.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub async fn get_global_emotes(
        &self,
        token: &Token,
    ) -> Result<Vec<Emote>, TwitchError> {
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
}
