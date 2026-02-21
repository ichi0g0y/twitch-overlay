//! Database schema definitions and migrations.

use rusqlite::Connection;

use crate::DbError;

pub fn run_migrations(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(SCHEMA)?;
    migrate_legacy_tables(conn)?;
    Ok(())
}

/// Go版からの既存テーブルをRust版スキーマに合わせるマイグレーション
fn migrate_legacy_tables(conn: &Connection) -> Result<(), DbError> {
    migrate_tracks_table(conn)?;
    migrate_playlist_tracks_table(conn)?;
    Ok(())
}

/// tracks テーブル: Go版(filename, has_artwork, created_at) → Rust版(file_path, added_at)
fn migrate_tracks_table(conn: &Connection) -> Result<(), DbError> {
    if !column_exists(conn, "tracks", "filename")? {
        return Ok(());
    }
    tracing::info!("Migrating tracks table from legacy schema");
    conn.execute_batch(
        "ALTER TABLE tracks RENAME COLUMN filename TO file_path;
         ALTER TABLE tracks RENAME COLUMN created_at TO added_at;",
    )?;
    if column_exists(conn, "tracks", "has_artwork")? {
        conn.execute_batch("ALTER TABLE tracks DROP COLUMN has_artwork;")?;
    }
    Ok(())
}

/// playlist_tracks テーブル: added_at カラムが無ければ追加
fn migrate_playlist_tracks_table(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "playlist_tracks", "added_at")? {
        return Ok(());
    }
    tracing::info!("Adding added_at column to playlist_tracks");
    conn.execute_batch("ALTER TABLE playlist_tracks ADD COLUMN added_at TIMESTAMP;")?;
    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, DbError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .any(|name| name.as_deref() == Ok(column));
    Ok(exists)
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

CREATE TABLE IF NOT EXISTS lottery_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reward_id TEXT,
    last_winner TEXT,
    base_tickets_limit INTEGER NOT NULL DEFAULT 3,
    final_tickets_limit INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lottery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_name TEXT NOT NULL,
    total_participants INTEGER NOT NULL,
    total_tickets INTEGER NOT NULL,
    participants_json TEXT,
    reward_ids_json TEXT,
    drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lottery_history_drawn_at
    ON lottery_history(drawn_at DESC);
"#;
