//! Lottery history storage.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LotteryHistory {
    pub id: i64,
    pub winner_name: String,
    pub total_participants: i32,
    pub total_tickets: i32,
    pub participants_json: String,
    pub reward_ids_json: String,
    pub drawn_at: String,
}

impl Database {
    pub fn save_lottery_history(&self, history: &LotteryHistory) -> Result<(), DbError> {
        self.with_conn(|conn| {
            if history.drawn_at.trim().is_empty() {
                conn.execute(
                    "INSERT INTO lottery_history
                        (winner_name, total_participants, total_tickets, participants_json, reward_ids_json, drawn_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)",
                    rusqlite::params![
                        history.winner_name,
                        history.total_participants,
                        history.total_tickets,
                        history.participants_json,
                        history.reward_ids_json,
                    ],
                )?;
            } else {
                conn.execute(
                    "INSERT INTO lottery_history
                        (winner_name, total_participants, total_tickets, participants_json, reward_ids_json, drawn_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![
                        history.winner_name,
                        history.total_participants,
                        history.total_tickets,
                        history.participants_json,
                        history.reward_ids_json,
                        history.drawn_at,
                    ],
                )?;
            }
            Ok(())
        })
    }

    pub fn get_lottery_history(&self, limit: i64) -> Result<Vec<LotteryHistory>, DbError> {
        self.with_conn(|conn| {
            let query =
                "SELECT id, winner_name, total_participants, total_tickets, COALESCE(participants_json, ''), COALESCE(reward_ids_json, ''), drawn_at
                 FROM lottery_history
                 ORDER BY drawn_at DESC, id DESC";

            if limit > 0 {
                let mut stmt = conn.prepare(&(query.to_string() + " LIMIT ?1"))?;
                let rows = stmt.query_map([limit], |row| {
                    Ok(LotteryHistory {
                        id: row.get(0)?,
                        winner_name: row.get(1)?,
                        total_participants: row.get(2)?,
                        total_tickets: row.get(3)?,
                        participants_json: row.get(4)?,
                        reward_ids_json: row.get(5)?,
                        drawn_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
            } else {
                let mut stmt = conn.prepare(query)?;
                let rows = stmt.query_map([], |row| {
                    Ok(LotteryHistory {
                        id: row.get(0)?,
                        winner_name: row.get(1)?,
                        total_participants: row.get(2)?,
                        total_tickets: row.get(3)?,
                        participants_json: row.get(4)?,
                        reward_ids_json: row.get(5)?,
                        drawn_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
            }
        })
    }

    pub fn delete_lottery_history(&self, id: i64) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM lottery_history WHERE id = ?1", [id])?;
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

    fn make_history(winner_name: &str, drawn_at: &str) -> LotteryHistory {
        LotteryHistory {
            id: 0,
            winner_name: winner_name.to_string(),
            total_participants: 10,
            total_tickets: 25,
            participants_json: "[]".to_string(),
            reward_ids_json: "[]".to_string(),
            drawn_at: drawn_at.to_string(),
        }
    }

    #[test]
    fn save_and_get_lottery_history() {
        let db = test_db();

        db.save_lottery_history(&make_history("alice", "2025-01-01T00:00:00Z"))
            .unwrap();
        db.save_lottery_history(&make_history("bob", "2025-01-02T00:00:00Z"))
            .unwrap();

        let history = db.get_lottery_history(0).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].winner_name, "bob");
        assert_eq!(history[1].winner_name, "alice");

        let limited = db.get_lottery_history(1).unwrap();
        assert_eq!(limited.len(), 1);
        assert_eq!(limited[0].winner_name, "bob");
    }

    #[test]
    fn delete_lottery_history_by_id() {
        let db = test_db();

        db.save_lottery_history(&make_history("alice", "2025-01-01T00:00:00Z"))
            .unwrap();
        let history = db.get_lottery_history(0).unwrap();
        assert_eq!(history.len(), 1);

        db.delete_lottery_history(history[0].id).unwrap();
        assert!(db.get_lottery_history(0).unwrap().is_empty());
    }
}
