use super::*;
use rand::SeedableRng;
use rand::rngs::StdRng;

fn participant(
    user_id: &str,
    username: &str,
    entry_count: i32,
    is_subscriber: bool,
    subscribed_months: i32,
    subscriber_tier: &str,
) -> LotteryParticipant {
    LotteryParticipant {
        user_id: user_id.to_string(),
        username: username.to_string(),
        display_name: username.to_string(),
        avatar_url: String::new(),
        redeemed_at: "2025-01-01T00:00:00Z".to_string(),
        is_subscriber,
        subscribed_months,
        subscriber_tier: subscriber_tier.to_string(),
        entry_count,
        assigned_color: "#fff".to_string(),
    }
}

#[test]
fn calculate_base_tickets_cases() {
    let cases = vec![
        (1, 3, 1),
        (3, 3, 3),
        (4, 3, 3),
        (0, 3, 1),
        (2, 0, 2),
        (5, -1, 3),
    ];

    for (entry_count, limit, want) in cases {
        let got = calculate_base_tickets(entry_count, limit);
        assert_eq!(got, want);
    }
}

#[test]
fn calculate_final_tickets_cases() {
    assert_eq!(calculate_final_tickets(3, None), 3);

    let tier1_1m = SubscriptionInfo {
        is_subscriber: true,
        tier: "1000".to_string(),
        cumulative_months: 1,
        final_tickets_limit: 0,
    };
    assert_eq!(calculate_final_tickets(3, Some(&tier1_1m)), 4);

    let tier3_12m = SubscriptionInfo {
        is_subscriber: true,
        tier: "3000".to_string(),
        cumulative_months: 12,
        final_tickets_limit: 0,
    };
    assert_eq!(calculate_final_tickets(3, Some(&tier3_12m)), 9);

    let unknown_tier = SubscriptionInfo {
        is_subscriber: true,
        tier: "unknown".to_string(),
        cumulative_months: 12,
        final_tickets_limit: 0,
    };
    assert_eq!(calculate_final_tickets(3, Some(&unknown_tier)), 4);

    let capped = SubscriptionInfo {
        is_subscriber: true,
        tier: "3000".to_string(),
        cumulative_months: 12,
        final_tickets_limit: 7,
    };
    assert_eq!(calculate_final_tickets(3, Some(&capped)), 7);
}

#[test]
fn draw_lottery_no_participants() {
    let mut rng = StdRng::seed_from_u64(1);
    let err = draw_lottery_with_rng(&[], &DrawOptions::default(), &mut rng).unwrap_err();
    assert_eq!(err, LotteryError::NoParticipants);
}

#[test]
fn draw_lottery_excludes_last_winner() {
    let participants = vec![
        participant("1", "alice", 3, true, 6, "1000"),
        participant("2", "bob", 1, true, 1, "1000"),
    ];

    let mut rng = StdRng::seed_from_u64(2);
    let result = draw_lottery_with_rng(
        &participants,
        &DrawOptions {
            base_tickets_limit: 3,
            final_tickets_limit: 0,
            last_winner: " Alice ".to_string(),
        },
        &mut rng,
    )
    .unwrap();

    assert_eq!(result.winner.username, "bob");
    assert_eq!(result.participants_detail.len(), 2);
    assert!(result.participants_detail[0].is_excluded);
}

#[test]
fn draw_lottery_weighted_distribution_prefers_heavier_user() {
    let participants = vec![
        participant("1", "alice", 1, true, 1, "1000"),
        participant("2", "bob", 3, true, 12, "3000"),
    ];
    let options = DrawOptions {
        base_tickets_limit: 3,
        final_tickets_limit: 0,
        last_winner: String::new(),
    };

    let mut rng = StdRng::seed_from_u64(42);
    let mut alice_wins = 0;
    let mut bob_wins = 0;

    for _ in 0..2000 {
        let result = draw_lottery_with_rng(&participants, &options, &mut rng).unwrap();
        if result.winner.username == "alice" {
            alice_wins += 1;
        } else if result.winner.username == "bob" {
            bob_wins += 1;
        }
    }

    assert_eq!(participants.len() as i32, 2);
    assert!(bob_wins > alice_wins * 3);
}

#[test]
fn draw_lottery_returns_error_when_no_eligible_participant() {
    let participants = vec![participant("1", "alice", 1, false, 0, "")];

    let mut rng = StdRng::seed_from_u64(99);
    let err = draw_lottery_with_rng(
        &participants,
        &DrawOptions {
            base_tickets_limit: 3,
            final_tickets_limit: 0,
            last_winner: "alice".to_string(),
        },
        &mut rng,
    )
    .unwrap_err();

    assert_eq!(err, LotteryError::NoEligibleParticipants);
}
