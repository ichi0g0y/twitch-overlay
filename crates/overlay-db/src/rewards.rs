//! Reward counts and reward groups.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

// --- Reward Counts ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardCount {
    pub reward_id: String,
    pub count: i32,
    pub user_names: Vec<String>,
    pub display_name: String,
    pub last_reset_at: String,
    pub updated_at: String,
}

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
                // Get current names
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
                let (count, names_json): (i32, String) = stmt.query_row([reward_id], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })?;

                let mut names: Vec<String> =
                    serde_json::from_str(&names_json).unwrap_or_default();
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

// --- Reward Groups ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardGroup {
    pub id: i64,
    pub name: String,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardGroupWithRewards {
    #[serde(flatten)]
    pub group: RewardGroup,
    pub reward_ids: Vec<String>,
}

impl Database {
    pub fn create_reward_group(&self, name: &str) -> Result<RewardGroup, DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO reward_groups (name, is_enabled, created_at, updated_at) VALUES (?1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [name],
            )?;
            let id = conn.last_insert_rowid();
            let mut stmt = conn.prepare(
                "SELECT id, name, is_enabled, created_at, updated_at FROM reward_groups WHERE id = ?1",
            )?;
            let group = stmt.query_row([id], |row| {
                Ok(RewardGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_enabled: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?;
            Ok(group)
        })
    }

    pub fn get_reward_groups(&self) -> Result<Vec<RewardGroup>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, is_enabled, created_at, updated_at FROM reward_groups ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(RewardGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_enabled: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn get_reward_group(&self, id: i64) -> Result<RewardGroup, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, is_enabled, created_at, updated_at FROM reward_groups WHERE id = ?1",
            )?;
            stmt.query_row([id], |row| {
                Ok(RewardGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_enabled: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(Into::into)
        })
    }

    pub fn update_reward_group_enabled(&self, id: i64, enabled: bool) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE reward_groups SET is_enabled = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                rusqlite::params![enabled, id],
            )?;
            Ok(())
        })
    }

    pub fn delete_reward_group(&self, id: i64) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM reward_groups WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    pub fn add_reward_to_group(&self, group_id: i64, reward_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO reward_group_members (group_id, reward_id, created_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
                rusqlite::params![group_id, reward_id],
            )?;
            Ok(())
        })
    }

    pub fn remove_reward_from_group(&self, group_id: i64, reward_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM reward_group_members WHERE group_id = ?1 AND reward_id = ?2",
                rusqlite::params![group_id, reward_id],
            )?;
            Ok(())
        })
    }

    pub fn get_group_rewards(&self, group_id: i64) -> Result<Vec<String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT reward_id FROM reward_group_members WHERE group_id = ?1 ORDER BY created_at",
            )?;
            let ids = stmt
                .query_map([group_id], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(ids)
        })
    }

    pub fn get_reward_groups_by_reward_id(
        &self,
        reward_id: &str,
    ) -> Result<Vec<RewardGroup>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT rg.id, rg.name, rg.is_enabled, rg.created_at, rg.updated_at
                 FROM reward_groups rg
                 INNER JOIN reward_group_members rgm ON rg.id = rgm.group_id
                 WHERE rgm.reward_id = ?1 ORDER BY rg.created_at DESC",
            )?;
            let rows = stmt.query_map([reward_id], |row| {
                Ok(RewardGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_enabled: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
