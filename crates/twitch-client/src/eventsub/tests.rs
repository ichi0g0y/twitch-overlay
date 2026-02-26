use super::*;

#[test]
fn parse_reconnect_url_from_payload() {
    let payload = serde_json::json!({
        "session": {
            "reconnect_url": "wss://eventsub.wss.twitch.tv/ws?token=reconnect"
        }
    });
    assert_eq!(
        EventSubClient::parse_reconnect_url(&payload).as_deref(),
        Some("wss://eventsub.wss.twitch.tv/ws?token=reconnect")
    );
}

#[test]
fn parse_reconnect_url_missing_returns_none() {
    let payload = serde_json::json!({
        "session": {}
    });
    assert_eq!(EventSubClient::parse_reconnect_url(&payload), None);
}
