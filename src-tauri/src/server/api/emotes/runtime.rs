fn emote_url_from_images(emote: &Emote) -> Option<String> {
    if !emote.id.is_empty() {
        let has_animated = emote
            .format
            .iter()
            .any(|value| value.eq_ignore_ascii_case("animated"));
        let has_static = emote
            .format
            .iter()
            .any(|value| value.eq_ignore_ascii_case("static"));
        let format = if has_animated {
            Some("animated")
        } else if has_static {
            Some("static")
        } else {
            None
        };

        if let Some(format) = format {
            let theme_mode = if emote
                .theme_mode
                .iter()
                .any(|value| value.eq_ignore_ascii_case("dark"))
            {
                "dark"
            } else if emote
                .theme_mode
                .iter()
                .any(|value| value.eq_ignore_ascii_case("light"))
            {
                "light"
            } else {
                "dark"
            };

            let scale = if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("3.0"))
            {
                "3.0"
            } else if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("2.0"))
            {
                "2.0"
            } else if emote
                .scale
                .iter()
                .any(|value| value.eq_ignore_ascii_case("1.0"))
            {
                "1.0"
            } else {
                "3.0"
            };

            return Some(format!(
                "https://static-cdn.jtvnw.net/emoticons/v2/{}/{}/{}/{}",
                emote.id, format, theme_mode, scale
            ));
        }
    }

    let url = if !emote.images.url_4x.is_empty() {
        emote.images.url_4x.clone()
    } else if !emote.images.url_2x.is_empty() {
        emote.images.url_2x.clone()
    } else {
        emote.images.url_1x.clone()
    };
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

async fn load_twitch_runtime(state: &SharedState) -> Option<TwitchRuntime> {
    let (client_id, client_secret, broadcaster_id, server_port) = {
        let config = state.config().await;
        (
            config.client_id.clone(),
            config.client_secret.clone(),
            config.twitch_user_id.clone(),
            config.server_port,
        )
    };

    if client_id.is_empty() || client_secret.is_empty() || broadcaster_id.is_empty() {
        return None;
    }

    let db_token = match state.db().get_latest_token() {
        Ok(Some(token)) => token,
        Ok(None) => return None,
        Err(e) => {
            tracing::warn!("Failed to load twitch token for emote API: {e}");
            return None;
        }
    };

    let current_token = Token {
        access_token: db_token.access_token.clone(),
        refresh_token: db_token.refresh_token.clone(),
        scope: db_token.scope.clone(),
        expires_at: db_token.expires_at,
    };

    let redirect_uri = format!("http://127.0.0.1:{server_port}/callback");
    let auth = TwitchAuth::new(client_id.clone(), client_secret, redirect_uri);
    let token = match auth.get_or_refresh_token(&current_token).await {
        Ok(Some(refreshed)) => {
            let db_tok = overlay_db::tokens::Token {
                access_token: refreshed.access_token.clone(),
                refresh_token: refreshed.refresh_token.clone(),
                scope: refreshed.scope.clone(),
                expires_at: refreshed.expires_at,
            };
            if let Err(e) = state.db().save_token(&db_tok) {
                tracing::warn!("Failed to save refreshed token for emote API: {e}");
            }
            refreshed
        }
        Ok(None) => current_token,
        Err(e) => {
            tracing::warn!("Failed to refresh twitch token for emote API: {e}");
            return None;
        }
    };

    Some(TwitchRuntime {
        client_id,
        broadcaster_id,
        token,
    })
}

async fn resolve_owner_channels(
    api: &TwitchApiClient,
    token: &Token,
    emotes: &[Emote],
) -> (
    HashMap<String, String>,
    HashMap<String, String>,
    HashMap<String, String>,
) {
    let mut owner_ids = Vec::new();
    let mut seen_owner_ids = HashSet::new();
    for emote in emotes {
        let Some(owner_id) = emote
            .owner_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()))
        else {
            continue;
        };
        if seen_owner_ids.insert(owner_id.to_string()) {
            owner_ids.push(owner_id.to_string());
        }
    }

    let mut owner_login_by_id: HashMap<String, String> = HashMap::new();
    let mut owner_display_name_by_login: HashMap<String, String> = HashMap::new();
    let mut owner_avatar_url_by_login: HashMap<String, String> = HashMap::new();
    if owner_ids.is_empty() {
        return (
            owner_login_by_id,
            owner_display_name_by_login,
            owner_avatar_url_by_login,
        );
    }

    for chunk in owner_ids.chunks(100) {
        let chunk_ids = chunk.to_vec();
        match api.get_users_by_ids(token, &chunk_ids).await {
            Ok(users) => {
                for user in users {
                    let id = user.id.trim();
                    let Some(login) = normalize_channel_login(&user.login) else {
                        continue;
                    };
                    if id.is_empty() {
                        continue;
                    }
                    owner_login_by_id.insert(id.to_string(), login.clone());
                    let display_name = user.display_name.trim();
                    if !display_name.is_empty() {
                        owner_display_name_by_login
                            .entry(login.clone())
                            .or_insert_with(|| display_name.to_string());
                    }
                    let avatar_url = user.profile_image_url.trim();
                    if !avatar_url.is_empty() {
                        owner_avatar_url_by_login
                            .entry(login)
                            .or_insert_with(|| avatar_url.to_string());
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to resolve owner users for emote API in batch (count={}): {e}",
                    chunk_ids.len()
                );
                // Fallback: retry per ID so one problematic value doesn't drop the whole chunk.
                for owner_id in chunk_ids {
                    match api.get_users_by_ids(token, std::slice::from_ref(&owner_id)).await {
                        Ok(users) => {
                            for user in users {
                                let id = user.id.trim();
                                let Some(login) = normalize_channel_login(&user.login) else {
                                    continue;
                                };
                                if id.is_empty() {
                                    continue;
                                }
                                owner_login_by_id.insert(id.to_string(), login.clone());
                                let display_name = user.display_name.trim();
                                if !display_name.is_empty() {
                                    owner_display_name_by_login
                                        .entry(login.clone())
                                        .or_insert_with(|| display_name.to_string());
                                }
                                let avatar_url = user.profile_image_url.trim();
                                if !avatar_url.is_empty() {
                                    owner_avatar_url_by_login
                                        .entry(login)
                                        .or_insert_with(|| avatar_url.to_string());
                                }
                            }
                        }
                        Err(inner) => {
                            tracing::debug!(
                                owner_id = %owner_id,
                                "Failed to resolve owner id in fallback lookup: {inner}"
                            );
                        }
                    }
                }
            }
        }
    }

    (
        owner_login_by_id,
        owner_display_name_by_login,
        owner_avatar_url_by_login,
    )
}

