//! Lottery/present participant storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LotteryParticipant {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: String,
    pub redeemed_at: String,
    pub is_subscriber: bool,
    pub subscriber_tier: String,
    pub entry_count: i32,
    pub assigned_color: String,
}

impl Database {
    pub fn add_lottery_participant(&self, p: &LotteryParticipant) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO lottery_participants
                    (user_id, username, display_name, avatar_url, redeemed_at, is_subscriber,
                     subscriber_tier, entry_count, assigned_color, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id) DO UPDATE SET
                    username = excluded.username,
                    display_name = excluded.display_name,
                    avatar_url = excluded.avatar_url,
                    redeemed_at = excluded.redeemed_at,
                    is_subscriber = excluded.is_subscriber,
                    subscriber_tier = excluded.subscriber_tier,
                    entry_count = MIN(lottery_participants.entry_count + excluded.entry_count, 3),
                    assigned_color = excluded.assigned_color,
                    updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![
                    p.user_id, p.username, p.display_name, p.avatar_url, p.redeemed_at,
                    p.is_subscriber, p.subscriber_tier, p.entry_count, p.assigned_color,
                ],
            )?;
            Ok(())
        })
    }

    pub fn get_all_lottery_participants(&self) -> Result<Vec<LotteryParticipant>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, username, display_name, avatar_url, redeemed_at, is_subscriber,
                        subscriber_tier, entry_count, assigned_color
                 FROM lottery_participants ORDER BY redeemed_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(LotteryParticipant {
                    user_id: row.get(0)?,
                    username: row.get(1)?,
                    display_name: row.get(2)?,
                    avatar_url: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    redeemed_at: row.get(4)?,
                    is_subscriber: row.get(5)?,
                    subscriber_tier: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    entry_count: row.get(7)?,
                    assigned_color: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn delete_lottery_participant(&self, user_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM lottery_participants WHERE user_id = ?1",
                [user_id],
            )?;
            Ok(())
        })
    }

    pub fn clear_all_lottery_participants(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM lottery_participants", [])?;
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
            Ok(())
        })
    }

    pub fn fix_entry_counts_over_3(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE lottery_participants SET entry_count = 3 WHERE entry_count > 3",
                [],
            )?;
            Ok(())
        })
    }
}
