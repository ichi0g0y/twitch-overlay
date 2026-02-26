use super::api::EmotePaginatedResponse;
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
