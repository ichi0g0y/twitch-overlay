use super::*;

impl TwitchApiClient {
    /// Get stream info for a broadcaster. Returns live status and viewer count.
    pub async fn get_stream_info(
        &self,
        token: &Token,
        user_id: &str,
    ) -> Result<StreamStatus, TwitchError> {
        let url = format!("{HELIX_BASE}/streams?user_id={user_id}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<StreamInfo> = serde_json::from_str(&body)?;

        match resp.data.into_iter().next() {
            Some(info) => Ok(StreamStatus {
                is_live: true,
                viewer_count: info.viewer_count,
                info: Some(info),
            }),
            None => Ok(StreamStatus {
                is_live: false,
                viewer_count: 0,
                info: None,
            }),
        }
    }

    /// Get stream info for multiple broadcasters (up to 100 user IDs).
    pub async fn get_streams_by_user_ids(
        &self,
        token: &Token,
        user_ids: &[String],
    ) -> Result<Vec<StreamInfo>, TwitchError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }

        let query = build_streams_query(user_ids);
        let url = format!("{HELIX_BASE}/streams?{query}");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<StreamInfo> = serde_json::from_str(&body)?;
        Ok(resp.data)
    }

    /// 最新アーカイブ動画の created_at を返す。動画なしなら None。
    pub async fn get_latest_video_date(
        &self,
        token: &Token,
        user_id: &str,
    ) -> Result<Option<String>, TwitchError> {
        let url = format!("{HELIX_BASE}/videos?user_id={user_id}&type=archive&first=1");
        let body = self.authenticated_get(&url, token).await?;
        let resp: HelixResponse<VideoInfo> = serde_json::from_str(&body)?;
        Ok(resp.data.into_iter().next().map(|v| v.created_at))
    }
}

pub(super) fn build_streams_query(user_ids: &[String]) -> String {
    let limited: Vec<&String> = user_ids.iter().take(100).collect();
    let first = limited.len().clamp(1, 100);
    let users = limited
        .into_iter()
        .map(|id| format!("user_id={id}"))
        .collect::<Vec<_>>()
        .join("&");
    format!("first={first}&{users}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_info_deserializes_started_at() {
        let body = r#"{
          "data": [{
            "id": "s1",
            "user_id": "u1",
            "user_login": "login",
            "game_name": "game",
            "title": "title",
            "viewer_count": 12,
            "started_at": "2026-02-16T00:00:00Z",
            "type": "live"
          }]
        }"#;

        let parsed: HelixResponse<StreamInfo> = serde_json::from_str(body).unwrap();
        let stream = &parsed.data[0];
        assert_eq!(stream.started_at.as_deref(), Some("2026-02-16T00:00:00Z"));
    }

    #[test]
    fn stream_info_allows_missing_started_at() {
        let body = r#"{
          "data": [{
            "id": "s1",
            "user_id": "u1",
            "user_login": "login",
            "game_name": "game",
            "title": "title",
            "viewer_count": 12,
            "type": "live"
          }]
        }"#;

        let parsed: HelixResponse<StreamInfo> = serde_json::from_str(body).unwrap();
        let stream = &parsed.data[0];
        assert_eq!(stream.started_at, None);
    }

    #[test]
    fn build_streams_query_sets_first_to_user_count() {
        let ids = vec!["u1".to_string(), "u2".to_string(), "u3".to_string()];
        let query = build_streams_query(&ids);

        assert!(query.starts_with("first=3&"));
        assert!(query.contains("user_id=u1"));
        assert!(query.contains("user_id=u2"));
        assert!(query.contains("user_id=u3"));
    }

    #[test]
    fn build_streams_query_caps_first_at_100() {
        let ids = (1..=120).map(|i| format!("u{i}")).collect::<Vec<_>>();
        let query = build_streams_query(&ids);

        assert!(query.starts_with("first=100&"));
        assert!(query.contains("user_id=u100"));
        assert!(!query.contains("user_id=u101"));
    }
}
