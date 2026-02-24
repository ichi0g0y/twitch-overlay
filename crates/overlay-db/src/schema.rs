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
    migrate_chat_user_profiles(conn)?;
    migrate_chat_users_add_display_name(conn)?;
    migrate_chat_messages_user_columns(conn)?;
    migrate_irc_chat_messages_badge_keys(conn)?;
    migrate_chat_messages_add_username(conn)?;
    migrate_irc_chat_messages_add_username(conn)?;
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

/// chat_messages に埋め込まれたユーザー情報を chat_users に集約
fn migrate_chat_user_profiles(conn: &Connection) -> Result<(), DbError> {
    let has_username = column_exists(conn, "chat_messages", "username")?;
    let has_avatar_url = column_exists(conn, "chat_messages", "avatar_url")?;
    if !has_username && !has_avatar_url {
        return Ok(());
    }

    let username_expr = if has_username {
        "COALESCE(username, '')"
    } else {
        "''"
    };
    let avatar_expr = if has_avatar_url {
        "COALESCE(avatar_url, '')"
    } else {
        "''"
    };

    let sql = format!(
        "INSERT INTO chat_users (user_id, username, avatar_url, updated_at)
         SELECT
             user_id,
             {username_expr},
             {avatar_expr},
             COALESCE(created_at, 0)
         FROM chat_messages
         WHERE user_id IS NOT NULL AND user_id != ''
         ON CONFLICT(user_id) DO UPDATE SET
             username = CASE
                 WHEN excluded.username != '' AND excluded.updated_at >= chat_users.updated_at
                 THEN excluded.username
                 ELSE chat_users.username
             END,
             avatar_url = CASE
                 WHEN excluded.avatar_url != ''
                      AND (chat_users.avatar_url = '' OR excluded.updated_at >= chat_users.updated_at)
                 THEN excluded.avatar_url
                 ELSE chat_users.avatar_url
             END,
             updated_at = CASE
                 WHEN excluded.updated_at > chat_users.updated_at
                 THEN excluded.updated_at
                 ELSE chat_users.updated_at
             END;"
    );

    conn.execute_batch(&sql)?;
    Ok(())
}

/// chat_messages から username/avatar_url カラムを除去
fn migrate_chat_messages_user_columns(conn: &Connection) -> Result<(), DbError> {
    let has_username = column_exists(conn, "chat_messages", "username")?;
    let has_avatar_url = column_exists(conn, "chat_messages", "avatar_url")?;
    if !has_username && !has_avatar_url {
        return Ok(());
    }

    tracing::info!("Migrating chat_messages to remove embedded user columns");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS chat_messages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT,
            user_id TEXT,
            message TEXT NOT NULL,
            fragments_json TEXT,
            translation_text TEXT DEFAULT '',
            translation_status TEXT DEFAULT '',
            translation_lang TEXT DEFAULT '',
            created_at INTEGER NOT NULL
        );

        INSERT INTO chat_messages_new (
            id, message_id, user_id, message, fragments_json,
            translation_text, translation_status, translation_lang, created_at
        )
        SELECT
            id, message_id, user_id, message, fragments_json,
            translation_text, translation_status, translation_lang, created_at
        FROM chat_messages;

        DROP TABLE chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_id
            ON chat_messages(message_id)
            WHERE message_id IS NOT NULL AND message_id != '';

        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
            ON chat_messages(created_at);

        CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
            ON chat_messages(user_id);",
    )?;
    Ok(())
}

fn migrate_irc_chat_messages_badge_keys(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "irc_chat_messages", "badge_keys_json")? {
        return Ok(());
    }

    tracing::info!("Adding badge_keys_json column to irc_chat_messages");
    conn.execute_batch(
        "ALTER TABLE irc_chat_messages ADD COLUMN badge_keys_json TEXT NOT NULL DEFAULT '[]';",
    )?;
    Ok(())
}

fn migrate_chat_users_add_display_name(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "chat_users", "display_name")? {
        return Ok(());
    }

    tracing::info!("Adding display_name column to chat_users");
    conn.execute_batch("ALTER TABLE chat_users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';")?;
    Ok(())
}

fn migrate_chat_messages_add_username(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "chat_messages", "username")? {
        return Ok(());
    }

    tracing::info!("Adding username column to chat_messages");
    conn.execute_batch(
        "ALTER TABLE chat_messages ADD COLUMN username TEXT NOT NULL DEFAULT '';
         UPDATE chat_messages
         SET username = COALESCE(
             (SELECT u.username FROM chat_users u WHERE u.user_id = chat_messages.user_id),
             ''
         )
         WHERE user_id IS NOT NULL AND user_id != '';",
    )?;
    Ok(())
}

fn migrate_irc_chat_messages_add_username(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "irc_chat_messages", "username")? {
        return Ok(());
    }

    tracing::info!("Adding username column to irc_chat_messages");
    conn.execute_batch(
        "ALTER TABLE irc_chat_messages ADD COLUMN username TEXT NOT NULL DEFAULT '';
         UPDATE irc_chat_messages
         SET username = COALESCE(
             (SELECT u.username FROM chat_users u WHERE u.user_id = irc_chat_messages.user_id),
             ''
         )
         WHERE user_id IS NOT NULL AND user_id != '';",
    )?;
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
    username TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    fragments_json TEXT,
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

CREATE TABLE IF NOT EXISTS chat_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_users_updated_at
    ON chat_users(updated_at);

CREATE TABLE IF NOT EXISTS irc_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_login TEXT NOT NULL,
    message_id TEXT,
    user_id TEXT,
    username TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    badge_keys_json TEXT NOT NULL DEFAULT '[]',
    fragments_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_irc_chat_messages_channel_message_id
    ON irc_chat_messages(channel_login, message_id)
    WHERE message_id IS NOT NULL AND message_id != '';

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_created_at
    ON irc_chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_channel
    ON irc_chat_messages(channel_login);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_user_id
    ON irc_chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_channel_created_at
    ON irc_chat_messages(channel_login, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS irc_channel_profiles (
    channel_login TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_irc_channel_profiles_updated_at
    ON irc_channel_profiles(updated_at);

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
