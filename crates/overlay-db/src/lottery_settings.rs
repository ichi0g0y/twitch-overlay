//! Lottery settings storage.

use crate::{Database, DbError};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LotterySettings {
    pub id: i64,
    pub reward_id: String,
    pub last_winner: String,
    pub base_tickets_limit: i32,
    pub final_tickets_limit: i32,
    pub updated_at: String,
}

impl Default for LotterySettings {
    fn default() -> Self {
        Self {
            id: 1,
            reward_id: String::new(),
            last_winner: String::new(),
            base_tickets_limit: 3,
            final_tickets_limit: 0,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Database {
    pub fn get_lottery_settings(&self) -> Result<LotterySettings, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, COALESCE(reward_id, ''), COALESCE(last_winner, ''), base_tickets_limit, final_tickets_limit, updated_at
                 FROM lottery_settings
                 WHERE id = 1",
            )?;

            let settings = stmt
                .query_row([], |row| {
                    Ok(LotterySettings {
                        id: row.get(0)?,
                        reward_id: row.get(1)?,
                        last_winner: row.get(2)?,
                        base_tickets_limit: row.get(3)?,
                        final_tickets_limit: row.get(4)?,
                        updated_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    })
                })
                .optional()?;

            Ok(settings.unwrap_or_default())
        })
    }

    pub fn update_lottery_settings(&self, settings: &LotterySettings) -> Result<(), DbError> {
        self.with_conn(|conn| {
            let base_tickets_limit = if settings.base_tickets_limit <= 0 {
                3
            } else {
                settings.base_tickets_limit
            };
            let final_tickets_limit = settings.final_tickets_limit.max(0);

            conn.execute(
                "INSERT INTO lottery_settings
                    (id, reward_id, last_winner, base_tickets_limit, final_tickets_limit, updated_at)
                 VALUES (1, ?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    reward_id = excluded.reward_id,
                    last_winner = excluded.last_winner,
                    base_tickets_limit = excluded.base_tickets_limit,
                    final_tickets_limit = excluded.final_tickets_limit,
                    updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![
                    settings.reward_id,
                    settings.last_winner,
                    base_tickets_limit,
                    final_tickets_limit,
                ],
            )?;
            Ok(())
        })
    }

    pub fn reset_last_winner(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO lottery_settings (id, reward_id, last_winner, base_tickets_limit, final_tickets_limit, updated_at)
                 VALUES (1, '', '', 3, 0, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    last_winner = '',
                    updated_at = CURRENT_TIMESTAMP",
                [],
            )?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("failed to create test db")
    }

    #[test]
    fn returns_default_when_row_does_not_exist() {
        let db = test_db();
        let settings = db.get_lottery_settings().unwrap();

        assert_eq!(settings.id, 1);
        assert_eq!(settings.reward_id, "");
        assert_eq!(settings.last_winner, "");
        assert_eq!(settings.base_tickets_limit, 3);
        assert_eq!(settings.final_tickets_limit, 0);
    }

    #[test]
    fn update_and_get_settings() {
        let db = test_db();
        let settings = LotterySettings {
            id: 1,
            reward_id: "reward-1".to_string(),
            last_winner: "alice".to_string(),
            base_tickets_limit: 5,
            final_tickets_limit: 12,
            updated_at: String::new(),
        };

        db.update_lottery_settings(&settings).unwrap();
        let got = db.get_lottery_settings().unwrap();

        assert_eq!(got.reward_id, "reward-1");
        assert_eq!(got.last_winner, "alice");
        assert_eq!(got.base_tickets_limit, 5);
        assert_eq!(got.final_tickets_limit, 12);
    }

    #[test]
    fn reset_last_winner_only_clears_last_winner() {
        let db = test_db();
        db.update_lottery_settings(&LotterySettings {
            id: 1,
            reward_id: "reward-x".to_string(),
            last_winner: "alice".to_string(),
            base_tickets_limit: 7,
            final_tickets_limit: 20,
            updated_at: String::new(),
        })
        .unwrap();

        db.reset_last_winner().unwrap();
        let got = db.get_lottery_settings().unwrap();

        assert_eq!(got.reward_id, "reward-x");
        assert_eq!(got.last_winner, "");
        assert_eq!(got.base_tickets_limit, 7);
        assert_eq!(got.final_tickets_limit, 20);
    }
}
