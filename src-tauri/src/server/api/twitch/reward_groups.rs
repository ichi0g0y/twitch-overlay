// ---------------------------------------------------------------------------
// Reward groups by reward
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RewardGroupByRewardQuery {
    pub reward_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FollowedChannelsQuery {
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct ChattersQuery {
    pub channel_login: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamStatusByLoginQuery {
    pub login: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StartRaidBody {
    pub to_broadcaster_id: Option<String>,
    pub to_channel_login: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StartShoutoutBody {
    pub to_broadcaster_id: Option<String>,
    pub to_channel_login: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct FollowedChannelStatus {
    broadcaster_id: String,
    broadcaster_login: String,
    broadcaster_name: String,
    profile_image_url: String,
    followed_at: String,
    is_live: bool,
    viewer_count: u64,
    title: Option<String>,
    game_name: Option<String>,
    started_at: Option<String>,
    last_broadcast_at: Option<String>,
}

fn sort_followed_channel_status(items: &mut [FollowedChannelStatus]) {
    items.sort_by(|a, b| {
        // 1. ライブ優先
        b.is_live
            .cmp(&a.is_live)
            // 2. ライブ同士: 視聴者数降順
            .then_with(|| b.viewer_count.cmp(&a.viewer_count))
            // 3. オフライン同士: last_broadcast_at降順（新しい配信が上）
            //    Noneは最下部（空文字で比較）
            .then_with(|| {
                let a_date = a.last_broadcast_at.as_deref().unwrap_or("");
                let b_date = b.last_broadcast_at.as_deref().unwrap_or("");
                b_date.cmp(a_date)
            })
            // 4. タイブレーカー: 名前順
            .then_with(|| {
                a.broadcaster_name
                    .to_ascii_lowercase()
                    .cmp(&b.broadcaster_name.to_ascii_lowercase())
            })
    });
}

/// コールドスタート用: オフラインチャンネルの最終配信日時を並列取得
async fn fetch_broadcast_dates_bulk(
    client: &TwitchApiClient,
    token: &twitch_client::Token,
    user_ids: &[String],
    now_epoch: i64,
) -> Vec<BroadcastCacheEntry> {
    let futs: Vec<_> = user_ids
        .iter()
        .map(|uid| {
            let uid = uid.clone();
            async move {
                match client.get_latest_video_date(token, &uid).await {
                    Ok(Some(date)) => Some(BroadcastCacheEntry {
                        broadcaster_id: uid,
                        last_broadcast_at: date,
                        updated_at: now_epoch,
                    }),
                    Ok(None) => None,
                    Err(e) => {
                        tracing::debug!(user_id = %uid, error = %e, "Failed to fetch video date");
                        None
                    }
                }
            }
        })
        .collect();
    let results: Vec<Option<BroadcastCacheEntry>> = stream::iter(futs)
        .buffer_unordered(10)
        .collect()
        .await;
    results.into_iter().flatten().collect()
}

/// broadcast cacheの更新とlast_broadcast_atマッピングを構築
async fn update_broadcast_cache(
    state: &SharedState,
    followed: &[FollowedChannel],
    stream_map: &HashMap<String, StreamInfo>,
    user_ids: &[String],
    client: &TwitchApiClient,
    token: &twitch_client::Token,
) -> HashMap<String, String> {
    let now_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let now_iso8601 = chrono::Utc::now().to_rfc3339();

    // --- 遷移検知: 前回ライブ → 今回オフライン ---
    let current_live_map: HashMap<String, Option<String>> = followed
        .iter()
        .filter_map(|item| {
            stream_map
                .get(&item.broadcaster_id)
                .map(|s| (item.broadcaster_id.clone(), s.started_at.clone()))
        })
        .collect();
    let prev_live_map = state.swap_followed_live_map(current_live_map.clone()).await;

    let current_live_ids: HashSet<&String> = current_live_map.keys().collect();

    // 遷移したチャンネル（前回ライブ → 今回オフライン）のstarted_atをDB保存
    let mut transition_entries: Vec<BroadcastCacheEntry> = Vec::new();
    for (bid, prev_started_at) in &prev_live_map {
        if !current_live_ids.contains(bid) {
            let broadcast_at = prev_started_at.as_deref().unwrap_or(&now_iso8601);
            transition_entries.push(BroadcastCacheEntry {
                broadcaster_id: bid.clone(),
                last_broadcast_at: broadcast_at.to_string(),
                updated_at: now_epoch,
            });
        }
    }

    // ライブ中チャンネルのstarted_atも随時更新（再起動対策）
    let mut live_entries: Vec<BroadcastCacheEntry> = Vec::new();
    for (bid, started_at) in &current_live_map {
        if let Some(sa) = started_at {
            live_entries.push(BroadcastCacheEntry {
                broadcaster_id: bid.clone(),
                last_broadcast_at: sa.clone(),
                updated_at: now_epoch,
            });
        }
    }

    let db = state.db();
    if !transition_entries.is_empty() {
        if let Err(e) = db.upsert_broadcast_cache_batch(&transition_entries) {
            tracing::warn!("Failed to save broadcast transition cache: {e}");
        }
    }
    if !live_entries.is_empty() {
        if let Err(e) = db.upsert_broadcast_cache_batch(&live_entries) {
            tracing::warn!("Failed to save live broadcast cache: {e}");
        }
    }

    // --- コールドスタート: オフラインチャンネルのキャッシュが空なら初回一括取得 ---
    let offline_ids: Vec<String> = user_ids
        .iter()
        .filter(|id| !current_live_ids.contains(id))
        .cloned()
        .collect();
    if !offline_ids.is_empty() {
        let cached_offline = db
            .get_broadcast_cache(&offline_ids)
            .unwrap_or_default();
        if cached_offline.is_empty() {
            tracing::info!(
                count = offline_ids.len(),
                "Cold start: fetching broadcast dates via Get Videos API"
            );
            let fresh =
                fetch_broadcast_dates_bulk(client, token, &offline_ids, now_epoch).await;
            if !fresh.is_empty() {
                if let Err(e) = db.upsert_broadcast_cache_batch(&fresh) {
                    tracing::warn!("Failed to save cold start broadcast cache: {e}");
                }
            }
        }
    }

    // --- DBキャッシュを参照してlast_broadcast_atをマッピング ---
    db.get_broadcast_cache(user_ids)
        .unwrap_or_default()
        .into_iter()
        .map(|e| (e.broadcaster_id, e.last_broadcast_at))
        .collect()
}

/// GET /api/twitch/reward-groups/by-reward
pub async fn reward_groups_by_reward(
    State(state): State<SharedState>,
    Query(q): Query<RewardGroupByRewardQuery>,
) -> ApiResult {
    let reward_id = q.reward_id.unwrap_or_default();
    if reward_id.is_empty() {
        return Ok(Json(json!({ "data": [] })));
    }
    let groups = state
        .db()
        .get_reward_groups_by_reward_id(&reward_id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "data": groups })))
}

