fn build_target_channels(ctx: &EmoteApiContext, user_state: &UserEmoteState) -> Vec<String> {
    let mut channels = Vec::new();
    let mut seen = HashSet::new();

    if let Some(channel) = ctx.priority_channel.clone() {
        if seen.insert(channel.clone()) {
            channels.push(channel);
        }
    }

    if let Some(login) = ctx.runtime_broadcaster_login.clone() {
        if seen.insert(login.clone()) {
            channels.push(login);
        }
    }

    if let Some(entry) = user_state.entry.as_ref() {
        for owner_login in entry.owner_login_by_id.values() {
            if seen.insert(owner_login.clone()) {
                channels.push(owner_login.clone());
            }
        }
    }

    if !user_state.available {
        for channel in &ctx.requested_channels {
            if seen.insert(channel.clone()) {
                channels.push(channel.clone());
            }
        }
    }

    channels
}

fn resolve_usable(
    source: EmoteSource,
    channel_login: Option<&str>,
    emote_id: &str,
    emote_type: Option<&str>,
    user_state: &UserEmoteState,
    priority_channel: Option<&str>,
    runtime_channel: Option<&str>,
) -> bool {
    if let Some(ids) = user_state.usable_emote_ids.as_ref() {
        if !ids.contains(emote_id) {
            return false;
        }

        if matches!(source, EmoteSource::Channel) {
            let normalized_type = emote_type.unwrap_or("").trim().to_ascii_lowercase();
            if matches!(normalized_type.as_str(), "follower" | "followers") {
                let is_globally_usable = user_state
                    .base_user_emote_ids
                    .as_ref()
                    .map(|base_ids| base_ids.contains(emote_id))
                    .unwrap_or(false);
                if is_globally_usable {
                    return true;
                }

                let active_channel = priority_channel.or(runtime_channel);
                return active_channel
                    .zip(channel_login)
                    .map(|(active, login)| active == login)
                    .unwrap_or(false);
            }
        }
        return true;
    }

    match source {
        EmoteSource::Special | EmoteSource::Unlocked | EmoteSource::Global => true,
        EmoteSource::Channel => {
            let Some(login) = channel_login else {
                return true;
            };

            if runtime_channel.map(|value| value == login).unwrap_or(false) {
                return true;
            }

            let is_priority_channel = priority_channel.map(|value| value == login).unwrap_or(false);
            if !is_priority_channel {
                return true;
            }

            let normalized_type = emote_type.unwrap_or("").trim().to_ascii_lowercase();
            !matches!(
                normalized_type.as_str(),
                "subscriptions" | "subscription" | "subscriber" | "subscribers"
            )
        }
    }
}

fn append_user_emotes_to_groups(
    ctx: &mut EmoteApiContext,
    user_state: &UserEmoteState,
    groups_by_id: &mut HashMap<String, EmoteGroup>,
) {
    let Some(entry) = user_state.entry.as_ref() else {
        return;
    };

    for (login, display_name) in &entry.owner_display_name_by_login {
        ctx.channel_display_names
            .entry(login.clone())
            .or_insert_with(|| display_name.clone());
    }
    for (login, avatar_url) in &entry.owner_avatar_url_by_login {
        ctx.channel_avatar_urls
            .entry(login.clone())
            .or_insert_with(|| avatar_url.clone());
    }
    for (owner_id, owner_login) in &entry.owner_login_by_id {
        ctx.channel_broadcaster_ids
            .entry(owner_login.clone())
            .or_insert_with(|| owner_id.clone());
    }

    for emote in &entry.emotes {
        if emote.name.is_empty() {
            continue;
        }
        let Some(url) = emote_url_from_images(emote) else {
            continue;
        };
        let channel_login = emote
            .owner_id
            .as_deref()
            .and_then(|owner_id| entry.owner_login_by_id.get(owner_id))
            .cloned();
        let source = resolve_emote_source(channel_login.as_deref(), emote.emote_type.as_deref());

        if matches!(source, EmoteSource::Channel)
            && channel_login
                .as_ref()
                .zip(ctx.priority_channel.as_ref())
                .map(|(owner, active)| owner == active)
                .unwrap_or(false)
        {
            continue;
        }

        let usable = resolve_usable(
            source,
            channel_login.as_deref(),
            &emote.id,
            emote.emote_type.as_deref(),
            user_state,
            ctx.priority_channel.as_deref(),
            ctx.runtime_broadcaster_login.as_deref(),
        );

        push_grouped_emote(
            groups_by_id,
            EmoteItem {
                id: emote.id.clone(),
                name: emote.name.clone(),
                url,
                source,
                channel_login,
                usable,
                emote_type: emote.emote_type.clone(),
                tier: emote.tier.clone(),
            },
        );
    }
}

async fn append_global_emotes_if_needed(
    ctx: &EmoteApiContext,
    user_state: &UserEmoteState,
    groups_by_id: &mut HashMap<String, EmoteGroup>,
) {
    if user_state.entry.is_some() {
        return;
    }

    match ctx.cache.get_global_emotes(&ctx.runtime.token).await {
        Ok(emotes) => {
            for emote in emotes {
                if emote.name.is_empty() {
                    continue;
                }
                let Some(url) = emote_url_from_images(&emote) else {
                    continue;
                };
                let usable = resolve_usable(
                    EmoteSource::Global,
                    None,
                    &emote.id,
                    emote.emote_type.as_deref(),
                    user_state,
                    ctx.priority_channel.as_deref(),
                    ctx.runtime_broadcaster_login.as_deref(),
                );
                push_grouped_emote(
                    groups_by_id,
                    EmoteItem {
                        id: emote.id,
                        name: emote.name,
                        url,
                        source: EmoteSource::Global,
                        channel_login: None,
                        usable,
                        emote_type: emote.emote_type,
                        tier: emote.tier,
                    },
                );
            }
        }
        Err(e) => tracing::warn!("Failed to fetch global emotes for emote API: {e}"),
    }
}

async fn append_channel_emotes(
    ctx: &mut EmoteApiContext,
    user_state: &UserEmoteState,
    target_channels: Vec<String>,
    groups_by_id: &mut HashMap<String, EmoteGroup>,
) {
    for channel_login in target_channels {
        let Some(broadcaster_id) = ctx.resolve_channel_broadcaster_id(&channel_login).await else {
            continue;
        };

        let Some(emotes) = load_cached_channel_emotes(
            &ctx.cache,
            &ctx.runtime.token,
            &broadcaster_id,
            ctx.force_refresh,
        )
        .await
        else {
            continue;
        };

        for emote in emotes {
            if emote.name.is_empty() {
                continue;
            }
            let Some(url) = emote_url_from_images(&emote) else {
                continue;
            };
            let source = resolve_emote_source(Some(channel_login.as_str()), emote.emote_type.as_deref());
            let usable = resolve_usable(
                source,
                Some(channel_login.as_str()),
                &emote.id,
                emote.emote_type.as_deref(),
                user_state,
                ctx.priority_channel.as_deref(),
                ctx.runtime_broadcaster_login.as_deref(),
            );

            push_grouped_emote(
                groups_by_id,
                EmoteItem {
                    id: emote.id,
                    name: emote.name,
                    url,
                    source,
                    channel_login: Some(channel_login.clone()),
                    usable,
                    emote_type: emote.emote_type,
                    tier: emote.tier,
                },
            );
        }
    }
}
