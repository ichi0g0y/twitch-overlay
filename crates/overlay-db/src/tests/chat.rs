use super::test_db;
use crate::chat;

#[test]
fn test_chat_messages() {
    let db = test_db();
    db.upsert_chat_user_profile("user1", "alice", "Alice", "", "", 900)
        .unwrap();
    let msg = chat::ChatMessage {
        id: 0,
        message_id: "msg1".into(),
        user_id: "user1".into(),
        username: "alice".into(),
        display_name: "Alice".into(),
        message: "hello".into(),
        badge_keys: vec!["subscriber/12".into(), "vip/1".into()],
        fragments_json: "[]".into(),
        avatar_url: String::new(),
        color: String::new(),
        translation_text: String::new(),
        translation_status: String::new(),
        translation_lang: String::new(),
        created_at: 1000,
    };
    assert!(db.add_chat_message(&msg).unwrap());
    assert!(!db.add_chat_message(&msg).unwrap());

    let msgs = db.get_chat_messages_since(0, None).unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].username, "alice");
    assert_eq!(msgs[0].display_name, "Alice");
    assert_eq!(msgs[0].avatar_url, "");
    assert_eq!(msgs[0].badge_keys, vec!["subscriber/12", "vip/1"]);

    assert!(db.chat_message_exists("msg1").unwrap());
    assert!(!db.chat_message_exists("msg2").unwrap());

    db.upsert_chat_user_profile(
        "user1",
        "alice_renamed",
        "AliceRenamed",
        "https://example.com/avatar.png",
        "#ff0000",
        1200,
    )
    .unwrap();
    let profile = db.get_chat_user_profile("user1").unwrap().unwrap();
    assert_eq!(profile.username, "alice_renamed");
    assert_eq!(profile.display_name, "AliceRenamed");
    assert_eq!(profile.avatar_url, "https://example.com/avatar.png");
    assert_eq!(profile.color, "#ff0000");

    let by_name = db
        .find_chat_user_profile_by_username("Alice_Renamed")
        .unwrap()
        .unwrap();
    assert_eq!(by_name.user_id, "user1");
    assert_eq!(by_name.username, "alice_renamed");
    assert_eq!(by_name.display_name, "AliceRenamed");

    let avatar = db.get_latest_chat_avatar("user1").unwrap().unwrap();
    assert_eq!(avatar, "https://example.com/avatar.png");

    let hydrated = db.get_chat_messages_since(0, None).unwrap();
    assert_eq!(hydrated.len(), 1);
    assert_eq!(hydrated[0].username, "alice_renamed");
    assert_eq!(hydrated[0].display_name, "AliceRenamed");
    assert_eq!(hydrated[0].avatar_url, "https://example.com/avatar.png");
    assert_eq!(hydrated[0].color, "#ff0000");
    assert_eq!(hydrated[0].badge_keys, vec!["subscriber/12", "vip/1"]);
}

#[test]
fn test_irc_chat_messages() {
    let db = test_db();
    db.upsert_chat_user_profile(
        "u1",
        "alice",
        "Alice",
        "https://example.com/a.png",
        "#00ff00",
        1000,
    )
    .unwrap();

    let msg = chat::IrcChatMessage {
        id: 0,
        channel_login: "sample_channel".into(),
        message_id: "irc-msg-1".into(),
        user_id: "u1".into(),
        username: "alice".into(),
        display_name: "Alice".into(),
        message: "hello from irc".into(),
        badge_keys: vec!["subscriber/24".into(), "moderator/1".into()],
        fragments_json: "[]".into(),
        avatar_url: String::new(),
        color: String::new(),
        created_at: 1200,
    };
    assert!(db.add_irc_chat_message(&msg).unwrap());
    assert!(!db.add_irc_chat_message(&msg).unwrap());

    let rows = db
        .get_irc_chat_messages_since("sample_channel", 0, None)
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].message, "hello from irc");
    assert_eq!(rows[0].username, "alice");
    assert_eq!(rows[0].display_name, "Alice");
    assert_eq!(rows[0].avatar_url, "https://example.com/a.png");
    assert_eq!(rows[0].color, "#00ff00");
    assert_eq!(rows[0].badge_keys, vec!["subscriber/24", "moderator/1"]);

    let msg2 = chat::IrcChatMessage {
        id: 0,
        channel_login: "sample_channel".into(),
        message_id: "irc-msg-2".into(),
        user_id: "u1".into(),
        username: "alice".into(),
        display_name: "Alice".into(),
        message: "second".into(),
        badge_keys: vec![],
        fragments_json: "[]".into(),
        avatar_url: String::new(),
        color: String::new(),
        created_at: 1250,
    };
    let msg3 = chat::IrcChatMessage {
        id: 0,
        channel_login: "sample_channel".into(),
        message_id: "irc-msg-3".into(),
        user_id: "u1".into(),
        username: "alice".into(),
        display_name: "Alice".into(),
        message: "third".into(),
        badge_keys: vec![],
        fragments_json: "[]".into(),
        avatar_url: String::new(),
        color: String::new(),
        created_at: 1260,
    };
    assert!(db.add_irc_chat_message(&msg2).unwrap());
    assert!(db.add_irc_chat_message(&msg3).unwrap());

    let limited = db
        .get_irc_chat_messages_since("sample_channel", 0, Some(2))
        .unwrap();
    assert_eq!(limited.len(), 2);
    assert_eq!(limited[0].message_id, "irc-msg-2");
    assert_eq!(limited[1].message_id, "irc-msg-3");

    db.cleanup_irc_chat_messages_exceeding_limit("sample_channel", 2)
        .unwrap();
    let trimmed = db
        .get_irc_chat_messages_since("sample_channel", 0, None)
        .unwrap();
    assert_eq!(trimmed.len(), 2);
    assert_eq!(trimmed[0].message_id, "irc-msg-2");
    assert_eq!(trimmed[1].message_id, "irc-msg-3");

    db.cleanup_irc_chat_messages_before(1300).unwrap();
    let rows_after = db
        .get_irc_chat_messages_since("sample_channel", 0, None)
        .unwrap();
    assert!(rows_after.is_empty());
}

#[test]
fn test_irc_channel_profiles() {
    let db = test_db();

    db.upsert_irc_channel_profile("sample_channel", "SampleChannel", 1000)
        .unwrap();
    db.upsert_irc_channel_profile("another_channel", "AnotherChannel", 1100)
        .unwrap();

    let one = db
        .get_irc_channel_profile("sample_channel")
        .unwrap()
        .unwrap();
    assert_eq!(one.channel_login, "sample_channel");
    assert_eq!(one.display_name, "SampleChannel");
    assert_eq!(one.updated_at, 1000);

    db.upsert_irc_channel_profile("sample_channel", "SampleRenamed", 1200)
        .unwrap();
    let updated = db
        .get_irc_channel_profile("sample_channel")
        .unwrap()
        .unwrap();
    assert_eq!(updated.display_name, "SampleRenamed");
    assert_eq!(updated.updated_at, 1200);

    let profiles = db
        .get_irc_channel_profiles(&[
            "sample_channel".to_string(),
            "another_channel".to_string(),
            "missing_channel".to_string(),
        ])
        .unwrap();
    assert_eq!(profiles.len(), 2);
}
