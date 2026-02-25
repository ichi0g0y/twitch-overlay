//! SQLite database layer for the overlay application.

pub mod broadcast_cache;
pub mod cache;
pub mod chat;
pub mod lottery;
pub mod lottery_engine;
pub mod lottery_history;
pub mod lottery_settings;
pub mod music;
pub mod rewards;
pub mod schema;
pub mod settings;
pub mod tokens;
pub mod word_filter;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

/// Thread-safe database handle wrapping a single SQLite connection.
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open or create database at the given path.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.configure()?;
        db.migrate()?;
        Ok(db)
    }

    /// Create an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.configure()?;
        db.migrate()?;
        Ok(db)
    }

    /// Access the underlying connection with a closure.
    pub fn with_conn<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&Connection) -> Result<R, DbError>,
    {
        let conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&conn)
    }

    /// Access the underlying connection mutably (for transactions).
    pub fn with_conn_mut<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&mut Connection) -> Result<R, DbError>,
    {
        let mut conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&mut conn)
    }

    fn configure(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA busy_timeout=5000;
                 PRAGMA foreign_keys=ON;",
            )?;
            Ok(())
        })
    }

    fn migrate(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            schema::run_migrations(conn)?;
            Ok(())
        })
    }
}

/// Database error type.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Database lock poisoned")]
    LockPoisoned,

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("Failed to create test DB")
    }

    #[test]
    fn test_open_and_migrate() {
        let db = test_db();
        // Verify tables exist by querying settings
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

    #[test]
    fn test_chat_messages() {
        let db = test_db();
        db.upsert_chat_user_profile("user1", "alice", "Alice", "", 900)
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
            translation_text: String::new(),
            translation_status: String::new(),
            translation_lang: String::new(),
            created_at: 1000,
        };
        assert!(db.add_chat_message(&msg).unwrap());
        // Duplicate should be ignored
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
            1200,
        )
        .unwrap();
        let profile = db.get_chat_user_profile("user1").unwrap().unwrap();
        assert_eq!(profile.username, "alice_renamed");
        assert_eq!(profile.display_name, "AliceRenamed");
        assert_eq!(profile.avatar_url, "https://example.com/avatar.png");

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
        assert_eq!(hydrated[0].badge_keys, vec!["subscriber/12", "vip/1"]);
    }

    #[test]
    fn test_irc_chat_messages() {
        let db = test_db();
        db.upsert_chat_user_profile("u1", "alice", "Alice", "https://example.com/a.png", 1000)
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

    #[test]
    fn test_lottery() {
        let db = test_db();
        let p = lottery::LotteryParticipant {
            user_id: "u1".into(),
            username: "bob".into(),
            display_name: "Bob".into(),
            avatar_url: String::new(),
            redeemed_at: "2024-01-01".into(),
            is_subscriber: false,
            subscribed_months: 0,
            subscriber_tier: String::new(),
            entry_count: 1,
            assigned_color: "#ff0000".into(),
        };
        db.add_lottery_participant(&p).unwrap();

        let all = db.get_all_lottery_participants().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].display_name, "Bob");

        db.clear_all_lottery_participants().unwrap();
        assert!(db.get_all_lottery_participants().unwrap().is_empty());
    }

    #[test]
    fn test_reward_counts() {
        let db = test_db();
        db.increment_reward_count("r1", "alice").unwrap();
        db.increment_reward_count("r1", "bob").unwrap();

        let rc = db.get_reward_count("r1").unwrap().unwrap();
        assert_eq!(rc.count, 2);
        assert_eq!(rc.user_names, vec!["alice", "bob"]);

        db.remove_one_user_from_reward_count("r1", 0).unwrap();
        let rc = db.get_reward_count("r1").unwrap().unwrap();
        assert_eq!(rc.count, 1);
        assert_eq!(rc.user_names, vec!["bob"]);

        db.reset_reward_count("r1").unwrap();
        let rc = db.get_reward_count("r1").unwrap().unwrap();
        assert_eq!(rc.count, 0);
        assert!(rc.user_names.is_empty());
    }

    #[test]
    fn test_reward_groups() {
        let db = test_db();
        let g = db.create_reward_group("test-group").unwrap();
        assert_eq!(g.name, "test-group");
        assert!(g.is_enabled);

        db.add_reward_to_group(g.id, "reward1").unwrap();
        db.add_reward_to_group(g.id, "reward2").unwrap();

        let rewards = db.get_group_rewards(g.id).unwrap();
        assert_eq!(rewards.len(), 2);

        let groups = db.get_reward_groups_by_reward_id("reward1").unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "test-group");

        db.remove_reward_from_group(g.id, "reward1").unwrap();
        assert_eq!(db.get_group_rewards(g.id).unwrap().len(), 1);

        db.delete_reward_group(g.id).unwrap();
        assert!(db.get_reward_groups().unwrap().is_empty());
    }

    #[test]
    fn test_word_filter() {
        let db = test_db();
        let w = db.add_word_filter_word("en", "badword", "bad").unwrap();
        assert_eq!(w.word, "badword");

        let words = db.get_word_filter_words("en").unwrap();
        assert_eq!(words.len(), 1);

        let langs = db.get_word_filter_languages().unwrap();
        assert_eq!(langs, vec!["en"]);

        db.set_word_filter_seed_version("v2").unwrap();
        assert_eq!(
            db.get_word_filter_seed_version().unwrap(),
            Some("v2".into())
        );

        db.delete_word_filter_word(w.id).unwrap();
        assert!(db.get_word_filter_words("en").unwrap().is_empty());
    }

    #[test]
    fn test_music() {
        let db = test_db();
        let track = music::Track {
            id: "t1".into(),
            file_path: "/music/song.mp3".into(),
            title: Some("Song".into()),
            artist: Some("Artist".into()),
            album: None,
            duration: Some(180.0),
            added_at: None,
        };
        db.add_track(&track).unwrap();

        let tracks = db.get_all_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, Some("Song".into()));

        db.create_playlist("p1", "My Playlist", "desc").unwrap();
        db.add_track_to_playlist("p1", "t1", 0).unwrap();

        let pt = db.get_playlist_tracks("p1").unwrap();
        assert_eq!(pt.len(), 1);
        assert_eq!(pt[0].track_id, "t1");

        let full_tracks = db.get_playlist_tracks_full("p1").unwrap();
        assert_eq!(full_tracks.len(), 1);
        assert_eq!(full_tracks[0].id, "t1");
        assert_eq!(full_tracks[0].title, Some("Song".into()));

        db.delete_track("t1").unwrap();
        assert!(db.get_all_tracks().unwrap().is_empty());
    }

    #[test]
    fn test_cache() {
        let db = test_db();
        db.add_cache_entry(
            "hash1",
            "https://example.com/img.png",
            "/cache/hash1.png",
            1024,
        )
        .unwrap();

        let entry = db.get_cache_entry("hash1").unwrap().unwrap();
        assert_eq!(entry.original_url, "https://example.com/img.png");
        assert_eq!(entry.file_size, 1024);

        let stats = db.get_cache_stats().unwrap();
        assert_eq!(stats.total_files, 1);
        assert_eq!(stats.total_size_bytes, 1024);

        db.delete_cache_entry("hash1").unwrap();
        assert!(db.get_cache_entry("hash1").unwrap().is_none());
    }
}
