//! Lottery calculator and weighted draw engine.

use crate::lottery::LotteryParticipant;
use rand::Rng;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_TICKETS_LIMIT: i32 = 3;
const TIER1_COEFFICIENT: f64 = 1.0;
const TIER2_COEFFICIENT: f64 = 1.1;
const TIER3_COEFFICIENT: f64 = 1.2;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubscriptionInfo {
    pub is_subscriber: bool,
    pub tier: String,
    pub cumulative_months: i32,
    pub final_tickets_limit: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParticipantDetail {
    pub username: String,
    pub base_tickets: i32,
    pub final_tickets: i32,
    pub subscribed_months: i32,
    pub subscriber_tier: String,
    pub is_excluded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DrawOptions {
    pub base_tickets_limit: i32,
    pub final_tickets_limit: i32,
    pub last_winner: String,
}

impl Default for DrawOptions {
    fn default() -> Self {
        Self {
            base_tickets_limit: DEFAULT_BASE_TICKETS_LIMIT,
            final_tickets_limit: 0,
            last_winner: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DrawResult {
    pub winner: LotteryParticipant,
    pub total_participants: i32,
    pub total_tickets: i32,
    pub participants_detail: Vec<ParticipantDetail>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum LotteryError {
    #[error("no participants")]
    NoParticipants,
    #[error("no eligible participants")]
    NoEligibleParticipants,
    #[error("invalid total tickets")]
    InvalidTotalTickets,
}

#[derive(Debug, Clone)]
struct WeightedUser {
    cumulative_sum: i32,
    participant: LotteryParticipant,
}

pub fn calculate_base_tickets(entry_count: i32, limit: i32) -> i32 {
    let effective_limit = if limit <= 0 {
        DEFAULT_BASE_TICKETS_LIMIT
    } else {
        limit
    };
    let normalized_entry_count = if entry_count <= 0 { 1 } else { entry_count };

    normalized_entry_count.min(effective_limit)
}

pub fn calculate_final_tickets(base_tickets: i32, sub_info: Option<&SubscriptionInfo>) -> i32 {
    let base_tickets = base_tickets.max(0);
    let Some(sub_info) = sub_info else {
        return base_tickets;
    };

    let months = sub_info.cumulative_months.max(0);
    let mut bonus = 0;

    if sub_info.is_subscriber {
        let coefficient = tier_coefficient(&sub_info.tier);
        if coefficient > 0.0 {
            let raw_bonus = months as f64 * coefficient * 1.1 / 3.0;
            bonus = raw_bonus.ceil() as i32;
        }

        if bonus < 1 {
            bonus = 1;
        }
    }

    let final_tickets = base_tickets + bonus;
    if sub_info.final_tickets_limit > 0 && final_tickets > sub_info.final_tickets_limit {
        return sub_info.final_tickets_limit;
    }

    final_tickets
}

pub fn draw_lottery(
    participants: &[LotteryParticipant],
    options: &DrawOptions,
) -> Result<DrawResult, LotteryError> {
    let mut rng = OsRng;
    draw_lottery_with_rng(participants, options, &mut rng)
}

pub fn draw_lottery_with_rng<R: Rng + ?Sized>(
    participants: &[LotteryParticipant],
    options: &DrawOptions,
    rng: &mut R,
) -> Result<DrawResult, LotteryError> {
    if participants.is_empty() {
        return Err(LotteryError::NoParticipants);
    }

    let mut weighted_users = Vec::with_capacity(participants.len());
    let mut participants_detail = Vec::with_capacity(participants.len());
    let mut total_tickets = 0i32;

    for participant in participants {
        let base_tickets =
            calculate_base_tickets(participant.entry_count, options.base_tickets_limit);
        let sub_info = SubscriptionInfo {
            is_subscriber: participant.is_subscriber,
            tier: participant.subscriber_tier.clone(),
            cumulative_months: participant.subscribed_months,
            final_tickets_limit: options.final_tickets_limit,
        };
        let final_tickets = calculate_final_tickets(base_tickets, Some(&sub_info));
        let is_excluded = is_last_winner(participant, &options.last_winner);

        participants_detail.push(ParticipantDetail {
            username: participant.username.clone(),
            base_tickets,
            final_tickets,
            subscribed_months: participant.subscribed_months,
            subscriber_tier: participant.subscriber_tier.clone(),
            is_excluded,
        });

        if is_excluded || final_tickets <= 0 {
            continue;
        }

        total_tickets = total_tickets
            .checked_add(final_tickets)
            .ok_or(LotteryError::InvalidTotalTickets)?;
        weighted_users.push(WeightedUser {
            cumulative_sum: total_tickets,
            participant: participant.clone(),
        });
    }

    if weighted_users.is_empty() || total_tickets <= 0 {
        return Err(LotteryError::NoEligibleParticipants);
    }

    let picked = rng.gen_range(0..total_tickets);
    let target_ticket = picked + 1;
    let winner_index = weighted_users.partition_point(|entry| entry.cumulative_sum < target_ticket);

    if winner_index >= weighted_users.len() {
        return Err(LotteryError::InvalidTotalTickets);
    }

    Ok(DrawResult {
        winner: weighted_users[winner_index].participant.clone(),
        total_participants: participants.len() as i32,
        total_tickets,
        participants_detail,
    })
}

fn is_last_winner(participant: &LotteryParticipant, last_winner: &str) -> bool {
    if last_winner.trim().is_empty() {
        return false;
    }

    participant
        .username
        .trim()
        .eq_ignore_ascii_case(last_winner.trim())
}

fn tier_coefficient(tier: &str) -> f64 {
    match tier {
        "1000" | "tier1" | "Tier1" | "TIER1" => TIER1_COEFFICIENT,
        "2000" | "tier2" | "Tier2" | "TIER2" => TIER2_COEFFICIENT,
        "3000" | "tier3" | "Tier3" | "TIER3" => TIER3_COEFFICIENT,
        _ => 0.0,
    }
}

#[cfg(test)]
#[path = "lottery_engine_tests.rs"]
mod tests;
