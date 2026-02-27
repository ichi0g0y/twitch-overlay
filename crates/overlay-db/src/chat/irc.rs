use crate::{Database, DbError};

use super::badge_keys::parse_badge_keys_json;
use super::models::{IrcChannelProfile, IrcChatMessage};
use super::optional_ext::OptionalExt;

impl Database {
    pub fn add_irc_chat_message(&self, msg: &IrcChatMessage) -> Result<bool, DbError> {
        let badge_keys_json = serde_json::to_string(&msg.badge_keys)
            .map_err(|e| DbError::InvalidData(format!("invalid badge keys: {e}")))?;
        self.with_conn(|conn| {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO irc_chat_messages
                    (channel_login, message_id, user_id, username, message, badge_keys_json, fragments_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    msg.channel_login,
                    msg.message_id,
                    msg.user_id,
                    msg.username,
                    msg.message,
                    badge_keys_json,
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
                        COALESCE(NULLIF(u.username, ''), NULLIF(m.username, ''), '') AS username,
                        COALESCE(NULLIF(u.display_name, ''), '') AS display_name,
                        m.message,
                        COALESCE(m.badge_keys_json, '[]') AS badge_keys_json,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        COALESCE(u.chat_color, '') AS color,
                        m.created_at
                     FROM irc_chat_messages m
                     LEFT JOIN chat_users u ON u.user_id = m.user_id
                     WHERE m.channel_login = ?1 AND m.created_at >= ?2
                     ORDER BY m.created_at DESC
                     LIMIT ?3"
                        .to_string(),
                    vec![
                        Box::new(channel_login.to_string()),
                        Box::new(since_unix),
                        Box::new(l),
                    ],
                ),
                None => (
                    "SELECT
                        m.id,
                        m.channel_login,
                        m.message_id,
                        m.user_id,
                        COALESCE(NULLIF(u.username, ''), NULLIF(m.username, ''), '') AS username,
                        COALESCE(NULLIF(u.display_name, ''), '') AS display_name,
                        m.message,
                        COALESCE(m.badge_keys_json, '[]') AS badge_keys_json,
                        m.fragments_json,
                        COALESCE(u.avatar_url, '') AS avatar_url,
                        COALESCE(u.chat_color, '') AS color,
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
            let mut rows = stmt
                .query_map(rusqlite::params_from_iter(params.iter()), |row| {
                    Ok(IrcChatMessage {
                        id: row.get(0)?,
                        channel_login: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        message_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        user_id: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        username: row.get(4)?,
                        display_name: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                        message: row.get(6)?,
                        badge_keys: parse_badge_keys_json(
                            row.get::<_, Option<String>>(7)?
                                .unwrap_or_else(|| "[]".to_string()),
                        )?,
                        fragments_json: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                        avatar_url: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                        color: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
                        created_at: row.get(11)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            if limit.is_some() {
                rows.reverse();
            }
            Ok(rows)
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

    pub fn cleanup_irc_chat_messages_exceeding_limit(
        &self,
        channel_login: &str,
        max_count: i64,
    ) -> Result<(), DbError> {
        let normalized_channel = channel_login.trim().to_lowercase();
        if normalized_channel.is_empty() {
            return Ok(());
        }

        if max_count <= 0 {
            return self.with_conn(|conn| {
                conn.execute(
                    "DELETE FROM irc_chat_messages WHERE channel_login = ?1",
                    rusqlite::params![normalized_channel],
                )?;
                Ok(())
            });
        }

        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM irc_chat_messages
                 WHERE channel_login = ?1
                   AND id NOT IN (
                       SELECT id
                       FROM irc_chat_messages
                       WHERE channel_login = ?1
                       ORDER BY created_at DESC, id DESC
                       LIMIT ?2
                   )",
                rusqlite::params![normalized_channel, max_count],
            )?;
            Ok(())
        })
    }

    pub fn upsert_irc_channel_profile(
        &self,
        channel_login: &str,
        display_name: &str,
        updated_at: i64,
    ) -> Result<(), DbError> {
        let normalized_channel = channel_login.trim().to_lowercase();
        if normalized_channel.is_empty() {
            return Ok(());
        }

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO irc_channel_profiles (channel_login, display_name, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(channel_login) DO UPDATE SET
                    display_name = excluded.display_name,
                    updated_at = excluded.updated_at",
                rusqlite::params![normalized_channel, display_name.trim(), updated_at],
            )?;
            Ok(())
        })
    }

    pub fn get_irc_channel_profile(
        &self,
        channel_login: &str,
    ) -> Result<Option<IrcChannelProfile>, DbError> {
        let normalized_channel = channel_login.trim().to_lowercase();
        if normalized_channel.is_empty() {
            return Ok(None);
        }

        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT channel_login, display_name, updated_at
                 FROM irc_channel_profiles
                 WHERE channel_login = ?1
                 LIMIT 1",
            )?;
            let profile = stmt
                .query_row([normalized_channel], |row| {
                    Ok(IrcChannelProfile {
                        channel_login: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        display_name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        updated_at: row.get::<_, Option<i64>>(2)?.unwrap_or_default(),
                    })
                })
                .optional()?;
            Ok(profile)
        })
    }

    pub fn get_irc_channel_profiles(
        &self,
        channel_logins: &[String],
    ) -> Result<Vec<IrcChannelProfile>, DbError> {
        let mut profiles = Vec::new();
        for channel_login in channel_logins {
            if let Some(profile) = self.get_irc_channel_profile(channel_login)? {
                profiles.push(profile);
            }
        }
        Ok(profiles)
    }
}
