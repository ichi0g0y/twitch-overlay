struct UserEmoteState {
    entry: Option<UserEmoteCacheEntry>,
    available: bool,
    reason: Option<&'static str>,
    base_user_emote_ids: Option<HashSet<String>>,
    usable_emote_ids: Option<HashSet<String>>,
}

async fn load_user_emote_state(ctx: &mut EmoteApiContext) -> UserEmoteState {
    let scope_available = token_has_scope(&ctx.runtime.token.scope, "user:read:emotes");
    let mut reason = None;

    let mut entry = if scope_available {
        load_cached_user_emotes(
            &ctx.api,
            &ctx.cache,
            &ctx.runtime.token,
            &ctx.emote_user_id,
            ctx.force_refresh,
        )
        .await
    } else {
        reason = Some("missing_scope:user:read:emotes");
        read_cached_user_emotes_if_fresh(&ctx.emote_user_id)
    };

    let base_user_emote_ids = entry.as_ref().map(|value| {
        value
            .emotes
            .iter()
            .map(|emote| emote.id.clone())
            .collect::<HashSet<String>>()
    });

    let supplemental_channels = build_supplemental_user_emote_channels(ctx);
    if let Some(current) = entry.as_mut() {
        append_supplemental_user_emotes(ctx, current, &supplemental_channels).await;
    }

    let usable_emote_ids = entry.as_ref().map(|value| {
        value
            .emotes
            .iter()
            .map(|emote| emote.id.clone())
            .collect::<HashSet<String>>()
    });

    let available = entry.is_some();

    UserEmoteState {
        entry,
        available,
        reason,
        base_user_emote_ids,
        usable_emote_ids,
    }
}

fn build_supplemental_user_emote_channels(ctx: &EmoteApiContext) -> Vec<String> {
    let mut channels = Vec::new();
    let mut seen = HashSet::new();

    if let Some(channel) = ctx.priority_channel.clone() {
        if seen.insert(channel.clone()) {
            channels.push(channel);
        }
    }

    for channel in &ctx.requested_channels {
        if seen.insert(channel.clone()) {
            channels.push(channel.clone());
        }
    }

    if channels.is_empty() {
        if let Some(login) = ctx.runtime_broadcaster_login.clone() {
            if seen.insert(login.clone()) {
                channels.push(login);
            }
        }
    }

    channels
}

async fn append_supplemental_user_emotes(
    ctx: &mut EmoteApiContext,
    entry: &mut UserEmoteCacheEntry,
    channels: &[String],
) {
    let mut additional_emotes = Vec::new();

    for channel_login in channels {
        let Some(broadcaster_id) = ctx.resolve_channel_broadcaster_id(channel_login).await else {
            continue;
        };

        match ctx
            .cache
            .get_user_emotes_for_broadcaster(&ctx.runtime.token, &ctx.emote_user_id, &broadcaster_id)
            .await
        {
            Ok(mut emotes) => additional_emotes.append(&mut emotes),
            Err(e) => {
                tracing::warn!(
                    channel_login,
                    "Failed to fetch broadcaster-scoped user emotes: {e}"
                );
            }
        }
    }

    if additional_emotes.is_empty() {
        return;
    }

    let (owner_login_by_id, owner_display_name_by_login, owner_avatar_url_by_login) =
        resolve_owner_channels(&ctx.api, &ctx.runtime.token, &additional_emotes).await;

    for (owner_id, owner_login) in owner_login_by_id {
        entry.owner_login_by_id.entry(owner_id).or_insert(owner_login);
    }

    for (owner_login, owner_display_name) in owner_display_name_by_login {
        ctx.channel_display_names
            .entry(owner_login.clone())
            .or_insert_with(|| owner_display_name.clone());
        entry
            .owner_display_name_by_login
            .entry(owner_login)
            .or_insert(owner_display_name);
    }

    for (owner_login, owner_avatar_url) in owner_avatar_url_by_login {
        ctx.channel_avatar_urls
            .entry(owner_login.clone())
            .or_insert_with(|| owner_avatar_url.clone());
        entry
            .owner_avatar_url_by_login
            .entry(owner_login)
            .or_insert(owner_avatar_url);
    }

    let mut seen_emote_ids = entry
        .emotes
        .iter()
        .map(|emote| emote.id.clone())
        .collect::<HashSet<String>>();

    for emote in additional_emotes {
        if seen_emote_ids.insert(emote.id.clone()) {
            entry.emotes.push(emote);
        }
    }
}
