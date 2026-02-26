//! Twitch emote cache.
//!
//! Fetches and caches global and per-channel emotes from the
//! Twitch Helix API so they can be resolved by emote ID.

mod api;
mod cache;
#[cfg(test)]
mod tests;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{Token, TwitchError};

const HELIX_BASE: &str = "https://api.twitch.tv/helix";

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

/// In-memory cache for global and channel emotes.
///
/// Emotes are indexed by emote ID for fast lookup.
pub struct EmoteCache {
    pub(super) client_id: String,
    pub(super) http: reqwest::Client,
    /// Emote ID -> Emote mapping.
    pub(super) emotes: HashMap<String, Emote>,
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
}
