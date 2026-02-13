//! Database schema definitions and migrations.

use rusqlite::Connection;

use crate::DbError;

pub fn run_migrations(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(SCHEMA)?;
    Ok(())
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    scope TEXT,
    expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    setting_type TEXT NOT NULL DEFAULT 'normal',
    is_required BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playback_state (
    id INTEGER PRIMARY KEY,
    track_id TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    playback_status TEXT NOT NULL DEFAULT 'stopped',
    is_playing BOOLEAN NOT NULL DEFAULT false,
    volume INTEGER NOT NULL DEFAULT 70,
    playlist_name TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    reward_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, reward_id),
    FOREIGN KEY (group_id) REFERENCES reward_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_created_rewards (
    reward_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_redemption_counts (
    reward_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    user_names TEXT DEFAULT '[]',
    display_name TEXT DEFAULT '',
    is_enabled BOOLEAN DEFAULT NULL,
    last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS word_filter_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    word TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bad', 'good')),
    UNIQUE(language, word, type)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    user_id TEXT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    fragments_json TEXT,
    avatar_url TEXT DEFAULT '',
    translation_text TEXT DEFAULT '',
    translation_status TEXT DEFAULT '',
    translation_lang TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_id
    ON chat_messages(message_id)
    WHERE message_id IS NOT NULL AND message_id != '';

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
    ON chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
    ON chat_messages(user_id);

CREATE TABLE IF NOT EXISTS lottery_participants (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    redeemed_at TIMESTAMP NOT NULL,
    is_subscriber BOOLEAN NOT NULL DEFAULT false,
    subscribed_months INTEGER NOT NULL DEFAULT 0,
    subscriber_tier TEXT DEFAULT '',
    entry_count INTEGER NOT NULL DEFAULT 1,
    assigned_color TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"#;
