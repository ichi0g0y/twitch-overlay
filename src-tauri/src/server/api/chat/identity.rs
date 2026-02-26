async fn resolve_moderation_capabilities(state: &SharedState) -> ModerationCapabilities {
    let config = state.config().await;
    if config.client_id.trim().is_empty() || config.twitch_user_id.trim().is_empty() {
        return ModerationCapabilities {
            can_timeout: false,
            can_block: false,
        };
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        _ => {
            return ModerationCapabilities {
                can_timeout: false,
                can_block: false,
            };
        }
    };

    ModerationCapabilities {
        can_timeout: token_has_scope(&db_token.scope, "moderator:manage:banned_users"),
        can_block: token_has_scope(&db_token.scope, "user:manage:blocked_users"),
    }
}

fn map_twitch_error(err: TwitchError) -> (axum::http::StatusCode, Json<Value>) {
    match err {
        TwitchError::ApiError { status, message } => err_json(status, &message),
        TwitchError::AuthRequired => err_json(401, "Authentication required"),
        other => err_json(500, &other.to_string()),
    }
}

fn parse_created_at_from_rfc3339(raw: Option<&str>) -> i64 {
    raw.and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| chrono::Utc::now().timestamp())
}

async fn resolve_default_user_id(state: &SharedState, body: &PostChatBody) -> String {
    if let Some(user_id) = body
        .user_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return user_id;
    }

    let configured = {
        let config = state.config().await;
        config.twitch_user_id.clone()
    };
    if !configured.trim().is_empty() {
        return configured;
    }

    "webui-local".to_string()
}

async fn resolve_default_username(state: &SharedState, user_id: &str) -> String {
    match state.db().get_chat_user_profile(user_id) {
        Ok(Some(profile)) if !profile.username.trim().is_empty() => profile.username,
        _ => {
            if !user_id.trim().is_empty() {
                return user_id.to_string();
            }
            "WebUI".to_string()
        }
    }
}

async fn resolve_avatar_url(state: &SharedState, body: &PostChatBody, user_id: &str) -> String {
    if let Some(avatar_url) = body
        .avatar_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        return avatar_url;
    }

    if let Ok(Some(profile)) = state.db().get_chat_user_profile(user_id) {
        if !profile.avatar_url.trim().is_empty() {
            return profile.avatar_url;
        }
    }

    if let Ok(Some(cached)) = state.db().get_latest_chat_avatar(user_id) {
        if !cached.trim().is_empty() {
            return cached;
        }
    }

    channel_points_assets::fetch_reward_avatar_url(state, user_id).await
}

async fn fetch_twitch_user_profile(state: &SharedState, user_id: &str) -> Option<TwitchUser> {
    if user_id.trim().is_empty() {
        return None;
    }

    let (client_id, access_token, refresh_token, scope, expires_at) = {
        let config = state.config().await;
        let token = state.db().get_latest_token().ok().flatten()?;
        (
            config.client_id.clone(),
            token.access_token,
            token.refresh_token,
            token.scope,
            token.expires_at,
        )
    };

    if client_id.is_empty() || access_token.is_empty() {
        return None;
    }

    let token = twitch_client::Token {
        access_token,
        refresh_token,
        scope,
        expires_at,
    };
    let client = TwitchApiClient::new(client_id);
    client.get_user(&token, user_id).await.ok()
}

async fn fetch_twitch_user_profile_by_login(
    state: &SharedState,
    login: &str,
) -> Option<TwitchUser> {
    let normalized_login = login.trim().trim_start_matches('@').to_lowercase();
    if normalized_login.is_empty() {
        return None;
    }

    let (client_id, access_token, refresh_token, scope, expires_at) = {
        let config = state.config().await;
        let token = state.db().get_latest_token().ok().flatten()?;
        (
            config.client_id.clone(),
            token.access_token,
            token.refresh_token,
            token.scope,
            token.expires_at,
        )
    };

    if client_id.is_empty() || access_token.is_empty() {
        return None;
    }

    let token = twitch_client::Token {
        access_token,
        refresh_token,
        scope,
        expires_at,
    };
    let client = TwitchApiClient::new(client_id);
    client
        .get_user_by_login(&token, &normalized_login)
        .await
        .ok()
}

async fn fetch_profile_snapshot_from_ivr(
    user_id: Option<&str>,
    login: Option<&str>,
) -> Option<IvrProfileSnapshot> {
    async fn fetch_once(query: &str) -> Option<IvrProfileSnapshot> {
        let url = format!("{IVR_TWITCH_USER_API_BASE}?{query}");
        let response = reqwest::Client::new().get(url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let users = response.json::<Vec<IvrTwitchUser>>().await.ok()?;
        let user = users.into_iter().next()?;
        let banner = user.banner.trim().to_string();
        if banner.is_empty() && user.followers.is_none() {
            return None;
        }
        Some(IvrProfileSnapshot {
            banner,
            followers: user.followers,
        })
    }

    let id_query = user_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(|id| format!("id={id}"));
    let login_query = login
        .map(str::trim)
        .map(|s| s.trim_start_matches('@').to_lowercase())
        .filter(|s| !s.is_empty())
        .map(|name| format!("login={name}"));

    let mut snapshot = None;
    if let Some(query) = id_query.as_deref() {
        snapshot = fetch_once(query).await;
    }

    let should_try_login = match snapshot.as_ref() {
        None => true,
        Some(found) => found.followers.is_none() || found.banner.trim().is_empty(),
    };
    if should_try_login {
        if let Some(query) = login_query.as_deref() {
            if let Some(by_login) = fetch_once(query).await {
                snapshot = match snapshot {
                    None => Some(by_login),
                    Some(current) => Some(IvrProfileSnapshot {
                        banner: if current.banner.trim().is_empty() {
                            by_login.banner
                        } else {
                            current.banner
                        },
                        followers: current.followers.or(by_login.followers),
                    }),
                };
            }
        }
    }

    snapshot
}

async fn fetch_follower_count_from_decapi(login: Option<&str>) -> Option<u64> {
    let normalized = login
        .map(str::trim)
        .map(|s| s.trim_start_matches('@').to_lowercase())
        .filter(|s| !s.is_empty())?;

    if !normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return None;
    }

    let url = format!("{DECAPI_TWITCH_FOLLOWCOUNT_BASE}/{normalized}");
    let response = reqwest::Client::new().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    let cleaned = text.trim().replace(',', "");
    cleaned.parse::<u64>().ok()
}

async fn resolve_twitch_irc_identity(
    state: &SharedState,
) -> Result<TwitchIrcIdentity, (axum::http::StatusCode, Json<Value>)> {
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

    let api = TwitchApiClient::new(config.client_id.clone());
    let sender_user = api
        .get_user(&token, &config.twitch_user_id)
        .await
        .map_err(map_twitch_error)?;

    let nick = sender_user.login.trim().to_lowercase();
    if nick.is_empty() {
        return Err(err_json(500, "Failed to resolve Twitch username"));
    }

    Ok(TwitchIrcIdentity {
        token,
        sender_user,
        nick,
    })
}

