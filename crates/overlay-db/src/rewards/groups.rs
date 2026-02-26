use crate::{Database, DbError};

use super::models::RewardGroup;

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
