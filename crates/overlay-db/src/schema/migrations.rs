use rusqlite::Connection;

use crate::DbError;

/// Go版からの既存テーブルをRust版スキーマに合わせるマイグレーション
pub(super) fn migrate_legacy_tables(conn: &Connection) -> Result<(), DbError> {
    migrate_tracks_table(conn)?;
    migrate_playlist_tracks_table(conn)?;
    migrate_chat_user_profiles(conn)?;
    migrate_chat_users_add_display_name(conn)?;
    migrate_chat_messages_user_columns(conn)?;
    migrate_chat_messages_badge_keys(conn)?;
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
    let has_badge_keys = column_exists(conn, "chat_messages", "badge_keys_json")?;
    let badge_keys_expr = if has_badge_keys {
        "COALESCE(badge_keys_json, '[]')"
    } else {
        "'[]'"
    };

    tracing::info!("Migrating chat_messages to remove embedded user columns");
    let sql = format!(
        "CREATE TABLE IF NOT EXISTS chat_messages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT,
            user_id TEXT,
            message TEXT NOT NULL,
            badge_keys_json TEXT NOT NULL DEFAULT '[]',
            fragments_json TEXT,
            translation_text TEXT DEFAULT '',
            translation_status TEXT DEFAULT '',
            translation_lang TEXT DEFAULT '',
            created_at INTEGER NOT NULL
        );

        INSERT INTO chat_messages_new (
            id, message_id, user_id, message, badge_keys_json, fragments_json,
            translation_text, translation_status, translation_lang, created_at
        )
        SELECT
            id, message_id, user_id, message, {badge_keys_expr}, fragments_json,
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
    );
    conn.execute_batch(&sql)?;
    Ok(())
}

fn migrate_chat_messages_badge_keys(conn: &Connection) -> Result<(), DbError> {
    if column_exists(conn, "chat_messages", "badge_keys_json")? {
        return Ok(());
    }

    tracing::info!("Adding badge_keys_json column to chat_messages");
    conn.execute_batch(
        "ALTER TABLE chat_messages ADD COLUMN badge_keys_json TEXT NOT NULL DEFAULT '[]';",
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
