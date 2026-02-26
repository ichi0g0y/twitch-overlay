use super::test_db;

#[test]
fn test_reward_counts() {
    let db = test_db();
    db.increment_reward_count("r1", "alice").unwrap();
    db.increment_reward_count("r1", "bob").unwrap();

    let rc = db.get_reward_count("r1").unwrap().unwrap();
    assert_eq!(rc.count, 2);
    assert_eq!(rc.user_names, vec!["alice", "bob"]);

    db.remove_one_user_from_reward_count("r1", 0).unwrap();
    let rc = db.get_reward_count("r1").unwrap().unwrap();
    assert_eq!(rc.count, 1);
    assert_eq!(rc.user_names, vec!["bob"]);

    db.reset_reward_count("r1").unwrap();
    let rc = db.get_reward_count("r1").unwrap().unwrap();
    assert_eq!(rc.count, 0);
    assert!(rc.user_names.is_empty());
}

#[test]
fn test_reward_groups() {
    let db = test_db();
    let g = db.create_reward_group("test-group").unwrap();
    assert_eq!(g.name, "test-group");
    assert!(g.is_enabled);

    db.add_reward_to_group(g.id, "reward1").unwrap();
    db.add_reward_to_group(g.id, "reward2").unwrap();

    let rewards = db.get_group_rewards(g.id).unwrap();
    assert_eq!(rewards.len(), 2);

    let groups = db.get_reward_groups_by_reward_id("reward1").unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].name, "test-group");

    db.remove_reward_from_group(g.id, "reward1").unwrap();
    assert_eq!(db.get_group_rewards(g.id).unwrap().len(), 1);

    db.delete_reward_group(g.id).unwrap();
    assert!(db.get_reward_groups().unwrap().is_empty());
}
