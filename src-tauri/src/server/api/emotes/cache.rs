async fn load_cached_user_emotes(
    api: &TwitchApiClient,
    cache: &EmoteCache,
    token: &Token,
    user_id: &str,
    force_refresh: bool,
) -> Option<UserEmoteCacheEntry> {
    let now = Instant::now();
    if !force_refresh {
        let guard = match user_emote_cache_map().lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(entry) = guard.get(user_id) {
            if now.duration_since(entry.cached_at) <= USER_EMOTE_CACHE_TTL {
                return Some(entry.clone());
            }
        }
    }

    let emotes = match cache.get_user_emotes(token, user_id).await {
        Ok(emotes) => emotes,
        Err(e) => {
            tracing::warn!("Failed to fetch usable user emotes for emote API (user_id={user_id}): {e}");
            return None;
        }
    };

    let (owner_login_by_id, owner_display_name_by_login, owner_avatar_url_by_login) =
        resolve_owner_channels(api, token, &emotes).await;
    let entry = UserEmoteCacheEntry {
        cached_at: now,
        emotes,
        owner_login_by_id,
        owner_display_name_by_login,
        owner_avatar_url_by_login,
    };

    let mut guard = match user_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    guard.insert(user_id.to_string(), entry.clone());
    Some(entry)
}

fn read_cached_user_emotes_if_fresh(user_id: &str) -> Option<UserEmoteCacheEntry> {
    let now = Instant::now();
    let guard = match user_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let entry = guard.get(user_id)?;
    if now.duration_since(entry.cached_at) <= USER_EMOTE_CACHE_TTL {
        Some(entry.clone())
    } else {
        None
    }
}

async fn load_cached_channel_emotes(
    cache: &EmoteCache,
    token: &Token,
    broadcaster_id: &str,
    force_refresh: bool,
) -> Option<Vec<Emote>> {
    let now = Instant::now();
    if !force_refresh {
        let guard = match channel_emote_cache_map().lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(entry) = guard.get(broadcaster_id) {
            if now.duration_since(entry.cached_at) <= CHANNEL_EMOTE_CACHE_TTL {
                return Some(entry.emotes.clone());
            }
        }
    }

    let emotes = match cache.get_channel_emotes(token, broadcaster_id).await {
        Ok(emotes) => emotes,
        Err(e) => {
            tracing::warn!(
                broadcaster_id,
                "Failed to fetch channel emotes for emote API cache: {e}"
            );
            return None;
        }
    };

    let entry = ChannelEmoteCacheEntry {
        cached_at: now,
        emotes: emotes.clone(),
    };
    let mut guard = match channel_emote_cache_map().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    guard.insert(broadcaster_id.to_string(), entry);

    Some(emotes)
}

fn push_grouped_emote(groups: &mut HashMap<String, EmoteGroup>, item: EmoteItem) {
    let (group_id, label, source, channel_login) = match &item.source {
        EmoteSource::Channel => {
            let login = item.channel_login.clone().unwrap_or_else(|| "unknown".to_string());
            (
                format!("channel:{login}"),
                format!("#{login}"),
                EmoteSource::Channel,
                Some(login),
            )
        }
        EmoteSource::Special => (
            item.channel_login
                .as_ref()
                .map(|login| format!("special:{login}"))
                .unwrap_or_else(|| "special".to_string()),
            item.channel_login
                .as_ref()
                .map(|login| format!("#{login}"))
                .unwrap_or_else(|| "特殊".to_string()),
            EmoteSource::Special,
            item.channel_login.clone(),
        ),
        EmoteSource::Unlocked => (
            "unlocked".to_string(),
            "アンロック済み".to_string(),
            EmoteSource::Unlocked,
            None,
        ),
        EmoteSource::Global => (
            "global".to_string(),
            "グローバル".to_string(),
            EmoteSource::Global,
            None,
        ),
    };

    let group = groups.entry(group_id.clone()).or_insert_with(|| EmoteGroup {
        id: group_id,
        label,
        source,
        channel_login,
        channel_avatar_url: None,
        priority: false,
        emotes: Vec::new(),
    });

    merge_emote_into_group(group, item);
}

