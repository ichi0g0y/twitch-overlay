use super::test_db;
use crate::tokens;

#[test]
fn test_open_and_migrate() {
    let db = test_db();
    let settings = db.get_all_settings().unwrap();
    assert!(settings.is_empty());
}

#[test]
fn test_settings_crud() {
    let db = test_db();
    db.set_setting("key1", "value1", "normal").unwrap();
    assert_eq!(db.get_setting("key1").unwrap(), Some("value1".into()));

    db.set_setting("key1", "value2", "normal").unwrap();
    assert_eq!(db.get_setting("key1").unwrap(), Some("value2".into()));

    db.delete_setting("key1").unwrap();
    assert_eq!(db.get_setting("key1").unwrap(), None);
}

#[test]
fn test_tokens() {
    let db = test_db();
    assert!(db.get_latest_token().unwrap().is_none());

    let token = tokens::Token {
        access_token: "abc".into(),
        refresh_token: "def".into(),
        scope: "read".into(),
        expires_at: 9999999,
    };
    db.save_token(&token).unwrap();

    let got = db.get_latest_token().unwrap().unwrap();
    assert_eq!(got.access_token, "abc");

    db.delete_all_tokens().unwrap();
    assert!(db.get_latest_token().unwrap().is_none());
}
