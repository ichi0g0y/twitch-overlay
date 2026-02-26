fn build_response_payload(
    mut groups_by_id: HashMap<String, EmoteGroup>,
    ctx: &EmoteApiContext,
    user_state: &UserEmoteState,
) -> Json<Value> {
    merge_special_groups_into_channel(&mut groups_by_id);
    let mut groups: Vec<EmoteGroup> = groups_by_id.into_values().collect();

    for group in &mut groups {
        if let Some(channel_login) = group.channel_login.as_ref() {
            let display_name = ctx
                .channel_display_names
                .get(channel_login)
                .map(|name| name.trim())
                .filter(|name| !name.is_empty())
                .map(|name| name.to_string())
                .unwrap_or_else(|| format!("#{channel_login}"));
            group.label = display_name;

            let avatar_url = ctx
                .channel_avatar_urls
                .get(channel_login)
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());
            group.channel_avatar_url = avatar_url;
        }

        group.priority = matches!(group.source, EmoteSource::Channel)
            && group
                .channel_login
                .as_ref()
                .zip(ctx.priority_channel.as_ref())
                .map(|(group_channel, priority)| group_channel == priority)
                .unwrap_or(false);
        sort_group_emotes(group);
    }

    let priority_login = ctx.priority_channel.as_deref();
    groups.sort_by(|a, b| {
        let rank = |group: &EmoteGroup| -> u8 {
            if matches!(group.source, EmoteSource::Channel)
                && group.channel_login.as_deref() == priority_login
            {
                return 0;
            }
            source_priority(&group.source) + 1
        };

        let sort_key = |group: &EmoteGroup| -> String {
            group
                .channel_login
                .as_deref()
                .map(|login| login.to_ascii_lowercase())
                .unwrap_or_else(|| group.label.to_ascii_lowercase())
        };

        rank(a)
            .cmp(&rank(b))
            .then_with(|| sort_key(a).cmp(&sort_key(b)))
    });

    let emotes: Vec<EmoteItem> = groups
        .iter()
        .flat_map(|group| group.emotes.iter().cloned())
        .collect();

    let mut meta = serde_json::Map::new();
    meta.insert(
        "user_emotes_available".to_string(),
        json!(user_state.available),
    );
    if let Some(reason) = user_state.reason {
        meta.insert("user_emotes_reason".to_string(), json!(reason));
    }

    Json(json!({
        "status": "ok",
        "data": {
            "groups": groups,
            "emotes": emotes,
        },
        "meta": meta
    }))
}

fn empty_emotes_payload() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "data": {
            "groups": [],
            "emotes": [],
        }
    }))
}
