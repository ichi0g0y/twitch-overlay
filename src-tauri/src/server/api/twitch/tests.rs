#[cfg(test)]
mod tests {
    use super::*;
    use twitch_client::api::{StreamInfo, StreamStatus};

    #[test]
    fn unauthorized_error_only_matches_401() {
        let unauthorized = TwitchError::ApiError {
            status: 401,
            message: "unauthorized".into(),
        };
        let forbidden = TwitchError::ApiError {
            status: 403,
            message: "forbidden".into(),
        };

        assert!(is_unauthorized_error(&unauthorized));
        assert!(!is_unauthorized_error(&forbidden));
        assert!(!is_unauthorized_error(&TwitchError::AuthRequired));
    }

    #[test]
    fn token_refresh_failed_maps_to_401() {
        let (status, body) = map_twitch_error(TwitchError::TokenRefreshFailed("invalid".into()));
        assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
        assert_eq!(
            body.0["error"],
            "Token refresh failed, please re-authenticate"
        );
    }

    #[test]
    fn rotated_refresh_token_is_detected() {
        let current = twitch_client::Token {
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            scope: "scope".into(),
            expires_at: 0,
        };
        let latest = twitch_client::Token {
            access_token: "new-access".into(),
            refresh_token: "new-refresh".into(),
            scope: "scope".into(),
            expires_at: 1,
        };
        let same = twitch_client::Token {
            access_token: "new-access".into(),
            refresh_token: "old-refresh".into(),
            scope: "scope".into(),
            expires_at: 1,
        };

        assert!(is_rotated_refresh_token(&current, &latest));
        assert!(!is_rotated_refresh_token(&current, &same));
    }

    #[test]
    fn offline_stream_status_payload_has_compat_keys() {
        let payload = offline_stream_status_payload();
        assert_eq!(payload["is_live"], false);
        assert_eq!(payload["viewer_count"], 0);
        assert_eq!(payload["isLive"], false);
        assert_eq!(payload["viewerCount"], 0);
        assert!(payload["title"].is_null());
        assert!(payload["startedAt"].is_null());
    }

    #[test]
    fn stream_status_payload_includes_snake_and_camel_case_fields() {
        let status = StreamStatus {
            is_live: true,
            viewer_count: 77,
            info: Some(StreamInfo {
                id: "stream-id".into(),
                user_id: "user-id".into(),
                user_login: "user-login".into(),
                game_name: "game".into(),
                title: "live title".into(),
                viewer_count: 77,
                started_at: Some("2026-02-16T00:00:00Z".into()),
                stream_type: "live".into(),
            }),
        };

        let payload = stream_status_payload(&status);
        assert_eq!(payload["is_live"], true);
        assert_eq!(payload["viewer_count"], 77);
        assert_eq!(payload["isLive"], true);
        assert_eq!(payload["viewerCount"], 77);
        assert_eq!(payload["title"], "live title");
        assert_eq!(payload["startedAt"], "2026-02-16T00:00:00Z");
        assert_eq!(payload["info"]["id"], "stream-id");
    }
}
