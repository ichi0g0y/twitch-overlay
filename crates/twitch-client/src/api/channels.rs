use super::*;

impl TwitchApiClient {
    /// Get channels followed by the specified user.
    pub async fn get_followed_channels(
        &self,
        token: &Token,
        user_id: &str,
        first: u32,
    ) -> Result<Vec<FollowedChannel>, TwitchError> {
        let (rows, _next_cursor) = self
            .get_followed_channels_page(token, user_id, first, None)
            .await?;
        Ok(rows)
    }

    /// Get one page of channels followed by the specified user.
    pub async fn get_followed_channels_page(
        &self,
        token: &Token,
        user_id: &str,
        first: u32,
        after: Option<&str>,
    ) -> Result<(Vec<FollowedChannel>, Option<String>), TwitchError> {
        let clamped = first.clamp(1, 100);
        let mut url = format!("{HELIX_BASE}/channels/followed?user_id={user_id}&first={clamped}");
        if let Some(cursor) = after.filter(|v| !v.is_empty()) {
            url.push_str("&after=");
            url.push_str(cursor);
        }
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixPaginatedResponse<FollowedChannel> = serde_json::from_str(&body)?;
        let next_cursor = resp.pagination.and_then(|p| p.cursor);
        Ok((resp.data, next_cursor))
    }

    /// Get one page of chatters for the specified broadcaster and moderator.
    pub async fn get_chatters_page(
        &self,
        token: &Token,
        broadcaster_id: &str,
        moderator_id: &str,
        first: u32,
        after: Option<&str>,
    ) -> Result<(Vec<Chatter>, Option<String>, u64), TwitchError> {
        let clamped = first.clamp(1, 1000);
        let mut url = format!(
            "{HELIX_BASE}/chat/chatters?broadcaster_id={broadcaster_id}&moderator_id={moderator_id}&first={clamped}"
        );
        if let Some(cursor) = after.filter(|v| !v.is_empty()) {
            url.push_str("&after=");
            url.push_str(cursor);
        }
        let body = self.authenticated_get(&url, token).await?;
        let resp: ChattersPaginatedResponse = serde_json::from_str(&body)?;
        let next_cursor = resp.pagination.and_then(|p| p.cursor);
        Ok((resp.data, next_cursor, resp.total))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chatters_paginated_response_deserializes_total_and_cursor() {
        let body = r#"{
          "data": [{
            "user_id": "1",
            "user_login": "alice",
            "user_name": "Alice"
          }],
          "pagination": { "cursor": "next-cursor" },
          "total": 120
        }"#;

        let parsed: ChattersPaginatedResponse = serde_json::from_str(body).unwrap();
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].user_login, "alice");
        assert_eq!(
            parsed.pagination.and_then(|p| p.cursor),
            Some("next-cursor".to_string())
        );
        assert_eq!(parsed.total, 120);
    }
}
