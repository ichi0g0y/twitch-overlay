use serde::Deserialize;

use super::*;

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
pub(super) struct EmotePaginatedResponse {
    pub(super) data: Vec<Emote>,
    #[serde(default)]
    pagination: Option<EmotePagination>,
}

impl EmoteCache {
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
