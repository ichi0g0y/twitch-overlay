//! Lottery/present participant storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LotteryParticipant {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: String,
    pub redeemed_at: String,
    pub is_subscriber: bool,
    pub subscribed_months: i32,
    pub subscriber_tier: String,
    pub entry_count: i32,
    pub assigned_color: String,
}

impl Database {
    pub fn add_lottery_participant(&self, p: &LotteryParticipant) -> Result<(), DbError> {
        self.with_conn(|conn| {
            let base_tickets_limit = get_current_base_tickets_limit(conn)?;
            let entry_count = sanitize_entry_count(p.entry_count);
            conn.execute(
                "INSERT INTO lottery_participants
                    (user_id, username, display_name, avatar_url, redeemed_at, is_subscriber,
                     subscribed_months, subscriber_tier, entry_count, assigned_color, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, MIN(?9, ?10), ?11, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id) DO UPDATE SET
                    username = excluded.username,
                    display_name = excluded.display_name,
                    avatar_url = excluded.avatar_url,
                    redeemed_at = excluded.redeemed_at,
                    is_subscriber = excluded.is_subscriber,
                    subscribed_months = excluded.subscribed_months,
                    subscriber_tier = excluded.subscriber_tier,
                    entry_count = MIN(lottery_participants.entry_count + excluded.entry_count, ?10),
                    assigned_color = excluded.assigned_color,
                    updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![
                    p.user_id,
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    p.redeemed_at,
                    p.is_subscriber,
                    p.subscribed_months,
                    p.subscriber_tier,
                    entry_count,
                    base_tickets_limit,
                    p.assigned_color,
                ],
            )?;
            Ok(())
        })
    }

    pub fn get_all_lottery_participants(&self) -> Result<Vec<LotteryParticipant>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, username, display_name, avatar_url, redeemed_at, is_subscriber,
                        subscribed_months, subscriber_tier, entry_count, assigned_color
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
                    subscribed_months: row.get(6)?,
                    subscriber_tier: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    entry_count: row.get(8)?,
                    assigned_color: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn update_lottery_participant(
        &self,
        user_id: &str,
        p: &LotteryParticipant,
    ) -> Result<(), DbError> {
        self.with_conn(|conn| {
            let base_tickets_limit = get_current_base_tickets_limit(conn)?;
            let entry_count = sanitize_entry_count(p.entry_count);
            conn.execute(
                "UPDATE lottery_participants
                 SET username = ?1,
                     display_name = ?2,
                     avatar_url = ?3,
                     redeemed_at = ?4,
                     is_subscriber = ?5,
                     subscribed_months = ?6,
                     subscriber_tier = ?7,
                     entry_count = MIN(?8, ?9),
                     assigned_color = ?10,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?11",
                rusqlite::params![
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    p.redeemed_at,
                    p.is_subscriber,
                    p.subscribed_months,
                    p.subscriber_tier,
                    entry_count,
                    base_tickets_limit,
                    p.assigned_color,
                    user_id,
                ],
            )?;
            Ok(())
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
            let base_tickets_limit = get_current_base_tickets_limit(conn)?;
            conn.execute(
                "UPDATE lottery_participants SET entry_count = ?1 WHERE entry_count > ?1",
                [base_tickets_limit],
            )?;
            Ok(())
        })
    }
}

fn get_current_base_tickets_limit(conn: &rusqlite::Connection) -> Result<i32, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT base_tickets_limit FROM lottery_settings WHERE id = 1")?;
    let limit = match stmt.query_row([], |row| row.get::<_, i32>(0)) {
        Ok(value) if value > 0 => value,
        Ok(_) => 3,
        Err(rusqlite::Error::QueryReturnedNoRows) => 3,
        Err(e) => return Err(e),
    };
    Ok(limit)
}

fn sanitize_entry_count(entry_count: i32) -> i32 {
    if entry_count <= 0 { 1 } else { entry_count }
}
