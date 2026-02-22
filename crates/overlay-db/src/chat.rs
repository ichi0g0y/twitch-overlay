//! Chat message history storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub message_id: String,
    pub user_id: String,
    pub username: String,
    pub message: String,
    pub fragments_json: String,
    pub avatar_url: String,
    pub translation_text: String,
    pub translation_status: String,
    pub translation_lang: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUserProfile {
    pub user_id: String,
    pub username: String,
    pub avatar_url: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcChatMessage {
    pub id: i64,
    pub channel_login: String,
    pub message_id: String,
    pub user_id: String,
    pub username: String,
    pub message: String,
    pub fragments_json: String,
    pub avatar_url: String,
    pub created_at: i64,
}

impl Database {
    pub fn add_chat_message(&self, msg: &ChatMessage) -> Result<bool, DbError> {
        self.with_conn(|conn| {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO chat_messages
                    (message_id, user_id, message, fragments_json,
                     translation_text, translation_status, translation_lang, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    msg.message_id,
                    msg.user_id,
                    msg.message,
                    msg.fragments_json,
                    msg.translation_text,
                    msg.translation_status,
                    msg.translation_lang,
                    msg.created_at,
                ],
            )?;
            Ok(changed > 0)
        })
    }

    pub fn get_chat_messages_since(
        &self,
        since_unix: i64,
        limit: Option<i64>,
    ) -> Result<Vec<ChatMessage>, DbError> {
        self.with_conn(|conn| {
            let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match limit {
                Some(l) => (
                    "SELECT
                        m.id,
                        m.message_id,
                        m.user_id,
                        COALESCE(u.username, '') AS username,
                        m.message,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        m.translation_text,
                        m.translation_status,
                        m.translation_lang,
                        m.created_at
                     FROM chat_messages m
                     LEFT JOIN chat_users u ON u.user_id = m.user_id
                     WHERE m.created_at >= ?1
                     ORDER BY m.created_at ASC
                     LIMIT ?2"
                        .to_string(),
                    vec![Box::new(since_unix), Box::new(l)],
                ),
                None => (
                    "SELECT
                        m.id,
                        m.message_id,
                        m.user_id,
                        COALESCE(u.username, '') AS username,
                        m.message,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        m.translation_text,
                        m.translation_status,
                        m.translation_lang,
                        m.created_at
                     FROM chat_messages m
                     LEFT JOIN chat_users u ON u.user_id = m.user_id
                     WHERE m.created_at >= ?1
                     ORDER BY m.created_at ASC"
                        .to_string(),
                    vec![Box::new(since_unix)],
                ),
            };

            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    message_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    user_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    username: row.get(3)?,
                    message: row.get(4)?,
                    fragments_json: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    avatar_url: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    translation_text: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    translation_status: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                    translation_lang: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                    created_at: row.get(10)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn cleanup_chat_messages_before(&self, cutoff_unix: i64) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM chat_messages WHERE created_at < ?1",
                [cutoff_unix],
            )?;
            Ok(())
        })
    }

    pub fn upsert_chat_user_profile(
        &self,
        user_id: &str,
        username: &str,
        avatar_url: &str,
        updated_at: i64,
    ) -> Result<(), DbError> {
        if user_id.trim().is_empty() {
            return Ok(());
        }
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chat_users (user_id, username, avatar_url, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
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
                    END",
                rusqlite::params![user_id, username, avatar_url, updated_at],
            )?;
            Ok(())
        })
    }

    pub fn get_chat_user_profile(&self, user_id: &str) -> Result<Option<ChatUserProfile>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, username, avatar_url, updated_at
                 FROM chat_users
                 WHERE user_id = ?1",
            )?;
            let profile = stmt
                .query_row([user_id], |row| {
                    Ok(ChatUserProfile {
                        user_id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        username: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        avatar_url: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        updated_at: row.get::<_, Option<i64>>(3)?.unwrap_or_default(),
                    })
                })
                .optional()?;
            Ok(profile)
        })
    }

    pub fn get_latest_chat_avatar(&self, user_id: &str) -> Result<Option<String>, DbError> {
        self.with_conn(|conn| {
            let mut user_stmt = conn.prepare(
                "SELECT avatar_url
                 FROM chat_users
                 WHERE user_id = ?1 AND avatar_url != ''
                 LIMIT 1",
            )?;
            let user_url = user_stmt
                .query_row([user_id], |row| row.get::<_, String>(0))
                .optional()?;
            Ok(user_url)
        })
    }

    pub fn chat_message_exists(&self, message_id: &str) -> Result<bool, DbError> {
        self.with_conn(|conn| {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM chat_messages WHERE message_id = ?1 LIMIT 1)",
                [message_id],
                |row| row.get(0),
            )?;
            Ok(exists)
        })
    }

    pub fn update_chat_translation(
        &self,
        message_id: &str,
        translation_text: &str,
        status: &str,
        lang: &str,
    ) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE chat_messages SET translation_text = ?1, translation_status = ?2, translation_lang = ?3 WHERE message_id = ?4",
                rusqlite::params![translation_text, status, lang, message_id],
            )?;
            Ok(())
        })
    }

    pub fn add_irc_chat_message(&self, msg: &IrcChatMessage) -> Result<bool, DbError> {
        self.with_conn(|conn| {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO irc_chat_messages
                    (channel_login, message_id, user_id, message, fragments_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    msg.channel_login,
                    msg.message_id,
                    msg.user_id,
                    msg.message,
                    msg.fragments_json,
                    msg.created_at,
                ],
            )?;
            Ok(changed > 0)
        })
    }

    pub fn get_irc_chat_messages_since(
        &self,
        channel_login: &str,
        since_unix: i64,
        limit: Option<i64>,
    ) -> Result<Vec<IrcChatMessage>, DbError> {
        self.with_conn(|conn| {
            let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match limit {
                Some(l) => (
                    "SELECT
                        m.id,
                        m.channel_login,
                        m.message_id,
                        m.user_id,
                        COALESCE(u.username, '') AS username,
                        m.message,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        m.created_at
                     FROM irc_chat_messages m
                     LEFT JOIN chat_users u ON u.user_id = m.user_id
                     WHERE m.channel_login = ?1 AND m.created_at >= ?2
                     ORDER BY m.created_at ASC
                     LIMIT ?3"
                        .to_string(),
                    vec![Box::new(channel_login.to_string()), Box::new(since_unix), Box::new(l)],
                ),
                None => (
                    "SELECT
                        m.id,
                        m.channel_login,
                        m.message_id,
                        m.user_id,
                        COALESCE(u.username, '') AS username,
                        m.message,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        m.created_at
                     FROM irc_chat_messages m
                     LEFT JOIN chat_users u ON u.user_id = m.user_id
                     WHERE m.channel_login = ?1 AND m.created_at >= ?2
                     ORDER BY m.created_at ASC"
                        .to_string(),
                    vec![Box::new(channel_login.to_string()), Box::new(since_unix)],
                ),
            };

            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
                Ok(IrcChatMessage {
                    id: row.get(0)?,
                    channel_login: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    message_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    user_id: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    username: row.get(4)?,
                    message: row.get(5)?,
                    fragments_json: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    avatar_url: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    created_at: row.get(8)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn cleanup_irc_chat_messages_before(&self, cutoff_unix: i64) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM irc_chat_messages WHERE created_at < ?1",
                [cutoff_unix],
            )?;
            Ok(())
        })
    }
}

trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
