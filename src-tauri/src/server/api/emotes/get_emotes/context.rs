struct EmoteApiContext {
    force_refresh: bool,
    requested_channels: Vec<String>,
    priority_channel: Option<String>,
    runtime: TwitchRuntime,
    api: TwitchApiClient,
    cache: EmoteCache,
    emote_user_id: String,
    runtime_broadcaster_login: Option<String>,
    channel_broadcaster_ids: HashMap<String, String>,
    channel_display_names: HashMap<String, String>,
    channel_avatar_urls: HashMap<String, String>,
}

impl EmoteApiContext {
    async fn from_request(state: &SharedState, query: &EmotesQuery) -> Option<Self> {
        let force_refresh = query.refresh.unwrap_or(false);
        let requested_channels = parse_channel_logins_csv(query.channels.as_deref());
        let priority_channel = query
            .priority_channel
            .as_deref()
            .and_then(normalize_channel_login);

        let runtime = load_twitch_runtime(state).await?;
        let api = TwitchApiClient::new(runtime.client_id.clone());
        let cache = EmoteCache::new(runtime.client_id.clone());

        let authenticated_user = match api.get_current_user(&runtime.token).await {
            Ok(user) => Some(user),
            Err(e) => {
                tracing::warn!("Failed to resolve authenticated user for emote API: {e}");
                None
            }
        };
        let emote_user_id = authenticated_user
            .as_ref()
            .map(|user| user.id.clone())
            .unwrap_or_else(|| runtime.broadcaster_id.clone());

        let runtime_broadcaster = match api.get_user(&runtime.token, &runtime.broadcaster_id).await {
            Ok(user) => normalize_channel_login(&user.login)
                .map(|login| (login, user.display_name, user.profile_image_url)),
            Err(e) => {
                tracing::warn!("Failed to resolve runtime broadcaster login for emote API: {e}");
                None
            }
        };

        let runtime_broadcaster_login = runtime_broadcaster
            .as_ref()
            .map(|(login, _, _)| login.clone());

        let mut channel_broadcaster_ids = HashMap::new();
        if let Some(login) = runtime_broadcaster_login.as_ref() {
            channel_broadcaster_ids.insert(login.clone(), runtime.broadcaster_id.clone());
        }

        let mut channel_display_names = HashMap::new();
        let mut channel_avatar_urls = HashMap::new();
        if let Some((login, display_name, profile_image_url)) = runtime_broadcaster {
            let name = display_name.trim();
            if !name.is_empty() {
                channel_display_names.insert(login.clone(), name.to_string());
            }
            let avatar_url = profile_image_url.trim();
            if !avatar_url.is_empty() {
                channel_avatar_urls.insert(login, avatar_url.to_string());
            }
        }

        Some(Self {
            force_refresh,
            requested_channels,
            priority_channel,
            runtime,
            api,
            cache,
            emote_user_id,
            runtime_broadcaster_login,
            channel_broadcaster_ids,
            channel_display_names,
            channel_avatar_urls,
        })
    }

    async fn resolve_channel_broadcaster_id(&mut self, channel_login: &str) -> Option<String> {
        if self.runtime_broadcaster_login.as_deref() == Some(channel_login) {
            return Some(self.runtime.broadcaster_id.clone());
        }

        if let Some(id) = self.channel_broadcaster_ids.get(channel_login) {
            return Some(id.clone());
        }

        match self
            .api
            .get_user_by_login(&self.runtime.token, channel_login)
            .await
        {
            Ok(user) => {
                let display_name = user.display_name.trim();
                if !display_name.is_empty() {
                    self.channel_display_names
                        .entry(channel_login.to_string())
                        .or_insert_with(|| display_name.to_string());
                }
                let avatar_url = user.profile_image_url.trim();
                if !avatar_url.is_empty() {
                    self.channel_avatar_urls
                        .entry(channel_login.to_string())
                        .or_insert_with(|| avatar_url.to_string());
                }
                self.channel_broadcaster_ids
                    .insert(channel_login.to_string(), user.id.clone());
                Some(user.id)
            }
            Err(e) => {
                tracing::warn!(channel_login, "Failed to resolve broadcaster id for emote API: {e}");
                None
            }
        }
    }
}
