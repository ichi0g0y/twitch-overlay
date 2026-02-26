use crate::{Database, DbError};

use super::models::ChatUserProfile;
use super::optional_ext::OptionalExt;

impl Database {
    pub fn upsert_chat_user_profile(
        &self,
        user_id: &str,
        username: &str,
        display_name: &str,
        avatar_url: &str,
        color: &str,
        updated_at: i64,
    ) -> Result<(), DbError> {
        if user_id.trim().is_empty() {
            return Ok(());
        }
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chat_users (user_id, username, display_name, avatar_url, chat_color, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(user_id) DO UPDATE SET
                    username = CASE
                        WHEN excluded.username != '' AND excluded.updated_at >= chat_users.updated_at
                        THEN excluded.username
                        ELSE chat_users.username
                    END,
                    display_name = CASE
                        WHEN excluded.display_name != '' AND excluded.updated_at >= chat_users.updated_at
                        THEN excluded.display_name
                        ELSE chat_users.display_name
                    END,
                    avatar_url = CASE
                        WHEN excluded.avatar_url != ''
                             AND (chat_users.avatar_url = '' OR excluded.updated_at >= chat_users.updated_at)
                        THEN excluded.avatar_url
                        ELSE chat_users.avatar_url
                    END,
                    chat_color = CASE
                        WHEN excluded.chat_color != '' AND excluded.updated_at >= chat_users.updated_at
                        THEN excluded.chat_color
                        ELSE chat_users.chat_color
                    END,
                    updated_at = CASE
                        WHEN excluded.updated_at > chat_users.updated_at
                        THEN excluded.updated_at
                        ELSE chat_users.updated_at
                    END",
                rusqlite::params![user_id, username, display_name, avatar_url, color, updated_at],
            )?;
            Ok(())
        })
    }

    pub fn get_chat_user_profile(&self, user_id: &str) -> Result<Option<ChatUserProfile>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, username, display_name, avatar_url, chat_color, updated_at
                 FROM chat_users
                 WHERE user_id = ?1",
            )?;
            let profile = stmt
                .query_row([user_id], |row| {
                    Ok(ChatUserProfile {
                        user_id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        username: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        display_name: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        avatar_url: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        color: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                        updated_at: row.get::<_, Option<i64>>(5)?.unwrap_or_default(),
                    })
                })
                .optional()?;
            Ok(profile)
        })
    }

    pub fn find_chat_user_profile_by_username(
        &self,
        username: &str,
    ) -> Result<Option<ChatUserProfile>, DbError> {
        let normalized = username.trim();
        if normalized.is_empty() {
            return Ok(None);
        }

        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, username, display_name, avatar_url, chat_color, updated_at
                 FROM chat_users
                 WHERE username != '' AND lower(username) = lower(?1)
                 ORDER BY updated_at DESC
                 LIMIT 1",
            )?;
            let profile = stmt
                .query_row([normalized], |row| {
                    Ok(ChatUserProfile {
                        user_id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        username: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        display_name: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        avatar_url: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        color: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                        updated_at: row.get::<_, Option<i64>>(5)?.unwrap_or_default(),
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
}
