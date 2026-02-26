use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardCount {
    pub reward_id: String,
    pub count: i32,
    pub user_names: Vec<String>,
    pub display_name: String,
    pub last_reset_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardGroup {
    pub id: i64,
    pub name: String,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardGroupWithRewards {
    #[serde(flatten)]
    pub group: RewardGroup,
    pub reward_ids: Vec<String>,
}
