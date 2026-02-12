//! OAuth token storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub access_token: String,
    pub refresh_token: String,
    pub scope: String,
    pub expires_at: i64,
}

impl Database {
    pub fn save_token(&self, token: &Token) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO tokens (access_token, refresh_token, scope, expires_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![token.access_token, token.refresh_token, token.scope, token.expires_at],
            )?;
            Ok(())
        })
    }

    pub fn get_latest_token(&self) -> Result<Option<Token>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT access_token, refresh_token, scope, expires_at FROM tokens ORDER BY id DESC LIMIT 1",
            )?;
            let token = stmt
                .query_row([], |row| {
                    Ok(Token {
                        access_token: row.get(0)?,
                        refresh_token: row.get(1)?,
                        scope: row.get(2)?,
                        expires_at: row.get(3)?,
                    })
                })
                .optional()?;
            Ok(token)
        })
    }

    pub fn delete_all_tokens(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM tokens", [])?;
            Ok(())
        })
    }

    pub fn record_app_created_reward(&self, reward_id: &str, title: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO app_created_rewards (reward_id, title) VALUES (?1, ?2)",
                rusqlite::params![reward_id, title],
            )?;
            Ok(())
        })
    }

    pub fn is_app_created_reward(&self, reward_id: &str) -> Result<bool, DbError> {
        self.with_conn(|conn| {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM app_created_rewards WHERE reward_id = ?1)",
                [reward_id],
                |row| row.get(0),
            )?;
            Ok(exists)
        })
    }

    pub fn get_all_app_created_reward_ids(&self) -> Result<Vec<String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT reward_id FROM app_created_rewards")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(ids)
        })
    }
}

/// Extension trait for optional query results.
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
