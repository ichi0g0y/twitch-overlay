use crate::{Database, DbError};

use super::models::RewardCount;
use super::optional_ext::OptionalExt;

impl Database {
    pub fn get_reward_count(&self, reward_id: &str) -> Result<Option<RewardCount>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT reward_id, count, COALESCE(user_names, '[]'), display_name, last_reset_at, updated_at
                 FROM reward_redemption_counts WHERE reward_id = ?1",
            )?;
            let rc = stmt
                .query_row([reward_id], |row| {
                    let names_json: String = row.get(2)?;
                    Ok(RewardCount {
                        reward_id: row.get(0)?,
                        count: row.get(1)?,
                        user_names: serde_json::from_str(&names_json).unwrap_or_default(),
                        display_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        last_reset_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                        updated_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    })
                })
                .optional()?;
            Ok(rc)
        })
    }

    pub fn get_all_reward_counts(&self) -> Result<Vec<RewardCount>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT reward_id, count, COALESCE(user_names, '[]'), display_name, last_reset_at, updated_at
                 FROM reward_redemption_counts ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                let names_json: String = row.get(2)?;
                Ok(RewardCount {
                    reward_id: row.get(0)?,
                    count: row.get(1)?,
                    user_names: serde_json::from_str(&names_json).unwrap_or_default(),
                    display_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    last_reset_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    updated_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn get_group_reward_counts(&self, group_id: i64) -> Result<Vec<RewardCount>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT rc.reward_id, rc.count, COALESCE(rc.user_names, '[]'), rc.display_name, rc.last_reset_at, rc.updated_at
                 FROM reward_redemption_counts rc
                 INNER JOIN reward_group_members rgm ON rc.reward_id = rgm.reward_id
                 WHERE rgm.group_id = ?1 ORDER BY rc.updated_at DESC",
            )?;
            let rows = stmt.query_map([group_id], |row| {
                let names_json: String = row.get(2)?;
                Ok(RewardCount {
                    reward_id: row.get(0)?,
                    count: row.get(1)?,
                    user_names: serde_json::from_str(&names_json).unwrap_or_default(),
                    display_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    last_reset_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    updated_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn increment_reward_count(&self, reward_id: &str, user_name: &str) -> Result<(), DbError> {
        self.with_conn_mut(|conn| {
            let tx = conn.transaction()?;
            {
                let current_names: Vec<String> = {
                    let mut stmt = tx.prepare(
                        "SELECT COALESCE(user_names, '[]') FROM reward_redemption_counts WHERE reward_id = ?1",
                    )?;
                    stmt.query_row([reward_id], |row| {
                        let json: String = row.get(0)?;
                        Ok(serde_json::from_str(&json).unwrap_or_default())
                    })
                    .unwrap_or_default()
                };

                let mut names = current_names;
                names.push(user_name.to_string());
                let names_json = serde_json::to_string(&names).unwrap_or_else(|_| "[]".into());

                tx.execute(
                    "INSERT INTO reward_redemption_counts (reward_id, count, user_names, updated_at)
                     VALUES (?1, 1, ?2, CURRENT_TIMESTAMP)
                     ON CONFLICT(reward_id) DO UPDATE SET count = count + 1, user_names = ?2, updated_at = CURRENT_TIMESTAMP",
                    rusqlite::params![reward_id, names_json],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn remove_one_user_from_reward_count(
        &self,
        reward_id: &str,
        index: usize,
    ) -> Result<(), DbError> {
        self.with_conn_mut(|conn| {
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    "SELECT count, COALESCE(user_names, '[]') FROM reward_redemption_counts WHERE reward_id = ?1",
                )?;
                let (count, names_json): (i32, String) =
                    stmt.query_row([reward_id], |row| Ok((row.get(0)?, row.get(1)?)))?;

                let mut names: Vec<String> = serde_json::from_str(&names_json).unwrap_or_default();
                if index < names.len() {
                    names.remove(index);
                }
                let new_count = (count - 1).max(0);
                let new_json = serde_json::to_string(&names).unwrap_or_else(|_| "[]".into());

                tx.execute(
                    "UPDATE reward_redemption_counts SET count = ?1, user_names = ?2, updated_at = CURRENT_TIMESTAMP WHERE reward_id = ?3",
                    rusqlite::params![new_count, new_json, reward_id],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn reset_reward_count(&self, reward_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE reward_redemption_counts SET count = 0, user_names = '[]', last_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE reward_id = ?1",
                [reward_id],
            )?;
            Ok(())
        })
    }

    pub fn reset_all_reward_counts(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE reward_redemption_counts SET count = 0, user_names = '[]', last_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP",
                [],
            )?;
            Ok(())
        })
    }

    pub fn set_reward_display_name(&self, reward_id: &str, name: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO reward_redemption_counts (reward_id, display_name, updated_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP)
                 ON CONFLICT(reward_id) DO UPDATE SET display_name = ?2, updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![reward_id, name],
            )?;
            Ok(())
        })
    }

    pub fn set_reward_enabled(&self, reward_id: &str, enabled: bool) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO reward_redemption_counts (reward_id, is_enabled, updated_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP)
                 ON CONFLICT(reward_id) DO UPDATE SET is_enabled = ?2, updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![reward_id, enabled],
            )?;
            Ok(())
        })
    }

    pub fn get_reward_enabled(&self, reward_id: &str) -> Result<Option<bool>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare("SELECT is_enabled FROM reward_redemption_counts WHERE reward_id = ?1")?;
            let enabled = stmt
                .query_row([reward_id], |row| row.get::<_, Option<bool>>(0))
                .optional()?
                .flatten();
            Ok(enabled)
        })
    }
}
