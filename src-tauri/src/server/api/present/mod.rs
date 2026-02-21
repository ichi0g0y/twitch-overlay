//! Lottery / present management API.

use axum::Json;
use serde_json::Value;
use std::sync::LazyLock;
use tokio::sync::RwLock;

use crate::app::SharedState;
use overlay_db::lottery::LotteryParticipant;

use super::err_json;

mod broadcast;
mod color;
mod history;
mod lifecycle;
mod lock;
mod participants;
mod settings;
mod subscribers;

pub use history::{delete_lottery_history, get_lottery_history};
pub use lifecycle::{clear_present, draw_lottery, draw_present, start_present, stop_present};
pub use lock::{lock_present, unlock_present};
pub use participants::{
    add_participant, add_test_participant, clear_lottery, delete_present_participant, get_lottery,
    get_present_participants, remove_participant, update_present_participant,
};
pub use settings::{get_lottery_settings, reset_lottery_winner, update_lottery_settings};
pub use subscribers::refresh_present_subscribers;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Clone, Default)]
struct LotteryRuntimeState {
    is_running: bool,
    is_locked: bool,
    winner: Option<LotteryParticipant>,
}

static LOTTERY_RUNTIME: LazyLock<RwLock<LotteryRuntimeState>> =
    LazyLock::new(|| RwLock::new(LotteryRuntimeState::default()));

fn get_all_participants(
    state: &SharedState,
) -> Result<Vec<LotteryParticipant>, (axum::http::StatusCode, Json<Value>)> {
    state
        .db()
        .get_all_lottery_participants()
        .map_err(|e| err_json(500, &e.to_string()))
}

fn get_ticket_limits(
    state: &SharedState,
) -> Result<(i32, i32), (axum::http::StatusCode, Json<Value>)> {
    let settings = state
        .db()
        .get_lottery_settings()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok((settings.base_tickets_limit, settings.final_tickets_limit))
}

fn is_numeric_user_id(user_id: &str) -> bool {
    !user_id.is_empty() && user_id.chars().all(|c| c.is_ascii_digit())
}

fn display_name_or_fallback(p: &LotteryParticipant) -> String {
    if !p.display_name.is_empty() {
        return p.display_name.clone();
    }
    if !p.username.is_empty() {
        return p.username.clone();
    }
    p.user_id.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_numeric_user_id() {
        assert!(is_numeric_user_id("12345"));
        assert!(!is_numeric_user_id(""));
        assert!(!is_numeric_user_id("abc"));
        assert!(!is_numeric_user_id("123abc"));
    }

    #[test]
    fn test_display_name_or_fallback() {
        let with_display_name = LotteryParticipant {
            user_id: "u1".to_string(),
            username: "alice".to_string(),
            display_name: "Alice".to_string(),
            avatar_url: String::new(),
            redeemed_at: String::new(),
            is_subscriber: false,
            subscribed_months: 0,
            subscriber_tier: String::new(),
            entry_count: 1,
            assigned_color: String::new(),
        };
        assert_eq!(display_name_or_fallback(&with_display_name), "Alice");

        let with_username = LotteryParticipant {
            display_name: String::new(),
            ..with_display_name.clone()
        };
        assert_eq!(display_name_or_fallback(&with_username), "alice");

        let with_user_id = LotteryParticipant {
            username: String::new(),
            ..with_username
        };
        assert_eq!(display_name_or_fallback(&with_user_id), "u1");
    }
}
