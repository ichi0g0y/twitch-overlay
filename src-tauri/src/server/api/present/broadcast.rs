use serde_json::json;

use crate::app::SharedState;

use overlay_db::lottery::LotteryParticipant;
use overlay_db::lottery_engine::ParticipantDetail;

use super::get_ticket_limits;

pub(super) fn broadcast_participant_added(state: &SharedState, participant: &LotteryParticipant) {
    let msg = json!({ "type": "lottery_participant_added", "data": participant });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_participants_updated(
    state: &SharedState,
    participants: &[LotteryParticipant],
) {
    let (base_tickets_limit, final_tickets_limit) = get_ticket_limits(state).unwrap_or((3, 0));
    let msg = json!({
        "type": "lottery_participants_updated",
        "data": {
            "participants": participants,
            "base_tickets_limit": base_tickets_limit,
            "final_tickets_limit": final_tickets_limit,
        }
    });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_participants_cleared(state: &SharedState) {
    let msg = json!({ "type": "lottery_participants_cleared", "data": null });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_lottery_started(state: &SharedState, participants: &[LotteryParticipant]) {
    let msg = json!({
        "type": "lottery_started",
        "data": {
            "participants": participants,
            "started_at": chrono::Utc::now().to_rfc3339(),
        }
    });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_lottery_stopped(state: &SharedState) {
    let msg = json!({
        "type": "lottery_stopped",
        "data": { "stopped_at": chrono::Utc::now().to_rfc3339() }
    });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_lottery_winner(
    state: &SharedState,
    winner: &LotteryParticipant,
    winner_index: i32,
    total_participants: i32,
    total_tickets: i32,
    participants_detail: &[ParticipantDetail],
) {
    let msg = json!({
        "type": "lottery_winner",
        "data": {
            "winner": winner,
            "winner_index": winner_index,
            "total_participants": total_participants,
            "total_tickets": total_tickets,
            "participants_detail": participants_detail,
        }
    });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_lottery_locked(state: &SharedState, is_locked: bool) {
    let data = if is_locked {
        json!({
            "is_locked": true,
            "locked_at": chrono::Utc::now().to_rfc3339(),
        })
    } else {
        json!({
            "is_locked": false,
            "unlocked_at": chrono::Utc::now().to_rfc3339(),
        })
    };
    let msg = json!({
        "type": if is_locked { "lottery_locked" } else { "lottery_unlocked" },
        "data": data,
    });
    let _ = state.ws_sender().send(msg.to_string());
}

pub(super) fn broadcast_lottery_winner_reset(state: &SharedState) {
    let msg = json!({
        "type": "lottery_winner_reset",
        "data": { "last_winner": "" }
    });
    let _ = state.ws_sender().send(msg.to_string());
}
