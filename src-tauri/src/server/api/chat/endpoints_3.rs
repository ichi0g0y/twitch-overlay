pub async fn post_chat_moderation_action(
    State(state): State<SharedState>,
    Json(body): Json<ChatModerationActionBody>,
) -> ApiResult {
    let target_user_id = body.user_id.trim().to_string();
    if target_user_id.is_empty() {
        return Err(err_json(400, "user_id is required"));
    }

    let config = state.config().await;
    if config.client_id.trim().is_empty() || config.twitch_user_id.trim().is_empty() {
        return Err(err_json(401, "Twitch credentials not configured"));
    }

    let db_token = state
        .db()
        .get_latest_token()
        .map_err(|e| err_json(500, &e.to_string()))?
        .ok_or_else(|| err_json(401, "No Twitch token stored"))?;
    let token = twitch_client::Token {
        access_token: db_token.access_token,
        refresh_token: db_token.refresh_token,
        scope: db_token.scope,
        expires_at: db_token.expires_at,
    };

    let can_timeout = token_has_scope(&token.scope, "moderator:manage:banned_users");
    let can_block = token_has_scope(&token.scope, "user:manage:blocked_users");
    let api = TwitchApiClient::new(config.client_id.clone());

    match body.action {
        ChatModerationAction::Timeout => {
            if !can_timeout {
                return Err(err_json(
                    403,
                    "Missing scope: moderator:manage:banned_users",
                ));
            }
            let duration_seconds = body.duration_seconds.unwrap_or(600).clamp(1, 1_209_600);
            let reason = body.reason.as_deref();
            let moderator = api
                .get_current_user(&token)
                .await
                .map_err(map_twitch_error)?;
            let moderator_id = moderator.id.trim();
            if moderator_id.is_empty() {
                return Err(err_json(500, "Failed to resolve moderator id"));
            }

            api.timeout_user(
                &token,
                &config.twitch_user_id,
                moderator_id,
                &target_user_id,
                duration_seconds,
                reason,
            )
            .await
            .map_err(map_twitch_error)?;

            Ok(Json(json!({
                "status": "ok",
                "action": "timeout",
                "user_id": target_user_id,
                "duration_seconds": duration_seconds,
            })))
        }
        ChatModerationAction::Block => {
            if !can_block {
                return Err(err_json(403, "Missing scope: user:manage:blocked_users"));
            }

            api.block_user(&token, &target_user_id)
                .await
                .map_err(map_twitch_error)?;

            Ok(Json(json!({
                "status": "ok",
                "action": "block",
                "user_id": target_user_id,
            })))
        }
    }
}

/// POST /api/chat/user-profile/detail
pub async fn get_user_profile_detail(
    State(state): State<SharedState>,
    Json(body): Json<ChatUserProfileDetailBody>,
) -> ApiResult {
    let now_unix = chrono::Utc::now().timestamp();
    let moderation_capabilities = resolve_moderation_capabilities(&state).await;
    let mut resolved_user_id = body
        .user_id
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let mut twitch_profile = None;

    if resolved_user_id.is_empty() {
        let login_hint = body
            .login
            .as_deref()
            .or(body.username.as_deref())
            .map(str::trim)
            .unwrap_or_default();
        if login_hint.is_empty() {
            return Err(err_json(400, "user_id or login is required"));
        }

        if let Some(profile) = state
            .db()
            .find_chat_user_profile_by_username(login_hint)
            .map_err(|e| err_json(500, &e.to_string()))?
        {
            resolved_user_id = profile.user_id.trim().to_string();
        }
        if resolved_user_id.is_empty() {
            twitch_profile = fetch_twitch_user_profile_by_login(&state, login_hint).await;
            if let Some(user) = twitch_profile.as_ref() {
                resolved_user_id = user.id.trim().to_string();
            }
        }
    }

    if resolved_user_id.is_empty() {
        return Err(err_json(404, "Twitch user not found"));
    }
    let force_refresh = body.force_refresh.unwrap_or(false);
    if !force_refresh {
        if let Some(cached) = load_cached_user_profile_detail(&state, &resolved_user_id)? {
            if now_unix - cached.cached_at <= USER_PROFILE_DETAIL_CACHE_TTL_SECONDS {
                return Ok(Json(cached_user_profile_to_json(
                    &cached,
                    moderation_capabilities,
                )));
            }
        }
    }

    let (username, _display_name, avatar_url) =
        resolve_chat_user_profile(&state, &resolved_user_id, body.username.as_deref(), force_refresh)
            .await?;
    if twitch_profile.is_none() {
        twitch_profile = fetch_twitch_user_profile(&state, &resolved_user_id).await;
    }

    let login = twitch_profile
        .as_ref()
        .map(|p| p.login.trim().to_string())
        .unwrap_or_default();
    let display_name = twitch_profile
        .as_ref()
        .map(|p| p.display_name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| username.clone());
    let description = twitch_profile
        .as_ref()
        .map(|p| p.description.trim().to_string())
        .unwrap_or_default();
    let broadcaster_type = twitch_profile
        .as_ref()
        .map(|p| p.broadcaster_type.trim().to_string())
        .unwrap_or_default();
    let user_type = twitch_profile
        .as_ref()
        .map(|p| p.user_type.trim().to_string())
        .unwrap_or_default();
    let profile_image_url = twitch_profile
        .as_ref()
        .map(|p| p.profile_image_url.trim().to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| avatar_url.clone());
    let cover_image_url = twitch_profile
        .as_ref()
        .map(|p| p.offline_image_url.trim().to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_default();
    let ivr_login_hint = if login.is_empty() {
        body.login
            .as_deref()
            .or(body.username.as_deref())
            .or(Some(username.as_str()))
    } else {
        Some(login.as_str())
    };
    let ivr_profile =
        fetch_profile_snapshot_from_ivr(Some(&resolved_user_id), ivr_login_hint).await;
    let cover_image_url = if cover_image_url.is_empty() {
        ivr_profile
            .as_ref()
            .map(|profile| profile.banner.trim().to_string())
            .filter(|url| !url.is_empty())
            .unwrap_or_default()
    } else {
        cover_image_url
    };
    let mut follower_count = ivr_profile.as_ref().and_then(|profile| profile.followers);
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(ivr_login_hint).await;
    }
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(body.username.as_deref()).await;
    }
    if follower_count.is_none() {
        follower_count = fetch_follower_count_from_decapi(Some(username.as_str())).await;
    }
    let view_count = twitch_profile
        .as_ref()
        .map(|p| p.view_count)
        .unwrap_or_default();
    let created_at = twitch_profile
        .as_ref()
        .map(|p| p.created_at.trim().to_string())
        .unwrap_or_default();
    let response_payload = CachedUserProfileDetail {
        user_id: resolved_user_id,
        username,
        avatar_url,
        display_name,
        login,
        description,
        user_type,
        broadcaster_type,
        profile_image_url,
        cover_image_url,
        follower_count,
        view_count,
        created_at,
        cached_at: now_unix,
    };
    save_cached_user_profile_detail(&state, &response_payload);
    Ok(Json(cached_user_profile_to_json(
        &response_payload,
        moderation_capabilities,
    )))
}

