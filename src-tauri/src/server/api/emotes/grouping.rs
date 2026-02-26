fn merge_emote_into_group(group: &mut EmoteGroup, item: EmoteItem) {
    if let Some(current) = group.emotes.iter_mut().find(|current| {
        if !item.id.is_empty() && !current.id.is_empty() {
            return current.id == item.id;
        }
        current.name == item.name && current.url == item.url
    }) {
        current.usable = current.usable || item.usable;
        if current.emote_type.is_none() {
            current.emote_type = item.emote_type;
        }
        if current.tier.is_none() {
            current.tier = item.tier;
        }
        return;
    }
    group.emotes.push(item);
}

fn merge_special_groups_into_channel(groups: &mut HashMap<String, EmoteGroup>) {
    let special_keys: Vec<String> = groups
        .keys()
        .filter(|key| key.starts_with("special:"))
        .cloned()
        .collect();
    for special_key in special_keys {
        let Some(special_group) = groups.remove(&special_key) else {
            continue;
        };
        let Some(login) = special_group.channel_login.clone() else {
            groups.insert(special_key, special_group);
            continue;
        };
        let channel_key = format!("channel:{login}");
        if let Some(channel_group) = groups.get_mut(&channel_key) {
            for emote in special_group.emotes {
                merge_emote_into_group(channel_group, emote);
            }
        } else {
            groups.insert(special_key, special_group);
        }
    }
}

fn is_special_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "bitstier"
            | "bits_tier"
            | "hypetrain"
            | "hype_train"
            | "limitedtime"
            | "limited_time"
            | "reward"
            | "rewards"
    )
}

fn is_unlocked_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "follower"
            | "followers"
            | "channel_points"
            | "channelpoints"
            | "unlock"
            | "unlocked"
            | "prime"
            | "turbo"
            | "twofactor"
    )
}

fn is_channel_emote_type(emote_type: Option<&str>) -> bool {
    let normalized = emote_type
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' '], "_");
    matches!(
        normalized.as_str(),
        "subscriptions"
            | "subscription"
            | "subscriber"
            | "subscribers"
            | "follower"
            | "followers"
    )
}

fn resolve_emote_source(channel_login: Option<&str>, emote_type: Option<&str>) -> EmoteSource {
    if channel_login.is_some() && is_channel_emote_type(emote_type) {
        return EmoteSource::Channel;
    }
    if channel_login.is_some() && is_special_emote_type(emote_type) {
        return EmoteSource::Special;
    }
    if is_unlocked_emote_type(emote_type) {
        return EmoteSource::Unlocked;
    }
    if channel_login.is_none() && is_special_emote_type(emote_type) {
        return EmoteSource::Unlocked;
    }
    if channel_login.is_some() {
        return EmoteSource::Channel;
    }
    EmoteSource::Global
}

fn sort_group_emotes(group: &mut EmoteGroup) {
    // Keep channel groups in API insertion order.
    // For the active channel this should align with Twitch's own picker ordering.
    if matches!(group.source, EmoteSource::Channel) {
        return;
    }

    fn normalized_emote_type(emote_type: Option<&str>) -> String {
        emote_type
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .replace(['-', ' '], "_")
    }

    fn tier_bucket(tier: Option<&str>) -> u8 {
        match tier
            .and_then(|value| value.trim().parse::<i32>().ok())
            .unwrap_or_default()
        {
            1000 => 1,
            2000 => 2,
            3000 => 3,
            _ => 4,
        }
    }

    fn emote_order_rank(emote_type: Option<&str>, tier: Option<&str>) -> u8 {
        let normalized = normalized_emote_type(emote_type);
        if matches!(normalized.as_str(), "follower" | "followers") {
            return 0;
        }
        if matches!(
            normalized.as_str(),
            "subscriptions" | "subscription" | "subscriber" | "subscribers"
        ) {
            return tier_bucket(tier);
        }
        if matches!(
            normalized.as_str(),
            "bitstier"
                | "bits_tier"
                | "reward"
                | "rewards"
                | "channel_points"
                | "channelpoints"
                | "hypetrain"
                | "hype_train"
                | "limitedtime"
                | "limited_time"
                | "unlock"
                | "unlocked"
                | "prime"
                | "turbo"
                | "twofactor"
        ) {
            return 5;
        }
        6
    }

    group.emotes.sort_by(|a, b| {
        b.usable
            .cmp(&a.usable)
            .then_with(|| {
                emote_order_rank(a.emote_type.as_deref(), a.tier.as_deref())
                    .cmp(&emote_order_rank(b.emote_type.as_deref(), b.tier.as_deref()))
            })
    });
}

fn source_priority(source: &EmoteSource) -> u8 {
    match source {
        EmoteSource::Channel => 0,
        EmoteSource::Special => 1,
        EmoteSource::Unlocked => 2,
        EmoteSource::Global => 3,
    }
}

