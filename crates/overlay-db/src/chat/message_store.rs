use crate::{Database, DbError};

use super::badge_keys::parse_badge_keys_json;
use super::models::ChatMessage;

impl Database {
    pub fn add_chat_message(&self, msg: &ChatMessage) -> Result<bool, DbError> {
        let badge_keys_json = serde_json::to_string(&msg.badge_keys)
            .map_err(|e| DbError::InvalidData(format!("invalid badge keys: {e}")))?;
        self.with_conn(|conn| {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO chat_messages
                    (message_id, user_id, username, message, badge_keys_json, fragments_json,
                     translation_text, translation_status, translation_lang, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    msg.message_id,
                    msg.user_id,
                    msg.username,
                    msg.message,
                    badge_keys_json,
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
                        COALESCE(NULLIF(u.username, ''), NULLIF(m.username, ''), '') AS username,
                        COALESCE(NULLIF(u.display_name, ''), '') AS display_name,
                        m.message,
                        COALESCE(m.badge_keys_json, '[]') AS badge_keys_json,
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
                        COALESCE(NULLIF(u.username, ''), NULLIF(m.username, ''), '') AS username,
                        COALESCE(NULLIF(u.display_name, ''), '') AS display_name,
                        m.message,
                        COALESCE(m.badge_keys_json, '[]') AS badge_keys_json,
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
                    display_name: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    message: row.get(5)?,
                    badge_keys: parse_badge_keys_json(
                        row.get::<_, Option<String>>(6)?
                            .unwrap_or_else(|| "[]".to_string()),
                    )?,
                    fragments_json: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    avatar_url: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                    translation_text: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                    translation_status: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
                    translation_lang: row.get::<_, Option<String>>(11)?.unwrap_or_default(),
                    created_at: row.get(12)?,
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
}
