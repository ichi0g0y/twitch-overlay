use super::test_db;
use crate::lottery;

#[test]
fn test_lottery() {
    let db = test_db();
    let p = lottery::LotteryParticipant {
        user_id: "u1".into(),
        username: "bob".into(),
        display_name: "Bob".into(),
        avatar_url: String::new(),
        redeemed_at: "2024-01-01".into(),
        is_subscriber: false,
        subscribed_months: 0,
        subscriber_tier: String::new(),
        entry_count: 1,
        assigned_color: "#ff0000".into(),
    };
    db.add_lottery_participant(&p).unwrap();

    let all = db.get_all_lottery_participants().unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].display_name, "Bob");

    db.clear_all_lottery_participants().unwrap();
    assert!(db.get_all_lottery_participants().unwrap().is_empty());
}
