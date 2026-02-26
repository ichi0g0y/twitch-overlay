fn add_primary_routes(router: Router<SharedState>) -> Router<SharedState> {
    router
        // --- Core ---
        .route("/status", get(status_handler))
        .route("/ws", get(websocket::ws_handler))
        .route("/auth", get(api::twitch::auth_redirect))
        .route("/callback", get(api::twitch::callback))
        // --- Settings ---
        .route("/api/settings", get(api::settings::get_settings_legacy))
        .route(
            "/api/settings/v2",
            get(api::settings::get_settings).put(api::settings::update_settings),
        )
        .route(
            "/api/settings/v2/reset",
            post(api::settings::reset_settings),
        )
        .route(
            "/api/settings/status",
            get(api::settings::get_settings_status),
        )
        .route("/api/settings/auth/status", get(api::twitch::auth_status))
        // --- Font ---
        .route("/api/settings/font/file", get(api::font::get_font_data))
        .route("/api/settings/font/preview", post(api::font::preview_font))
        .route("/api/font/data", get(api::font::get_font_data))
        // --- Overlay ---
        .route(
            "/api/settings/overlay",
            get(api::overlay::get_overlay_settings).post(api::overlay::update_overlay_settings),
        )
        .route("/api/overlay/refresh", post(api::overlay::refresh_overlay))
        // --- Music tracks ---
        .route("/api/music/tracks", get(api::music::get_tracks))
        .route(
            "/api/music/track/all",
            delete(api::music::delete_all_tracks),
        )
        .route(
            "/api/music/track/{id}",
            get(api::music::get_track).delete(api::music::delete_track),
        )
        .route("/api/music/track/{id}/audio", get(api::music::stream_audio))
        .route(
            "/api/music/track/{id}/artwork",
            get(api::music::get_artwork),
        )
        // --- Music playlists ---
        .route(
            "/api/music/playlists",
            get(api::music_playlist::get_playlists),
        )
        .route(
            "/api/music/playlist",
            post(api::music_playlist::create_playlist),
        )
        .route(
            "/api/music/playlist/{id}",
            get(api::music_playlist::get_playlist)
                .put(api::music_playlist::modify_playlist)
                .delete(api::music_playlist::delete_playlist),
        )
        .route(
            "/api/music/playlist/{id}/tracks",
            get(api::music_playlist::get_playlist_tracks),
        )
        // --- Music state & control ---
        .route(
            "/api/music/state/get",
            get(api::music_state::get_playback_state),
        )
        .route(
            "/api/music/state",
            get(api::music_state::get_playback_state),
        )
        .route(
            "/api/music/state/update",
            post(api::music_state::save_playback_state),
        )
        .route("/api/music/status", get(api::music_state::get_music_status))
        .route(
            "/api/music/status/update",
            post(api::music_state::update_music_status),
        )
        .route(
            "/api/music/control/{action}",
            post(api::music_state::music_control),
        )
        // --- Cache ---
        .route("/api/cache/stats", get(api::cache::get_cache_stats))
        .route(
            "/api/cache/settings",
            get(api::cache::get_cache_settings).put(api::cache::update_cache_settings),
        )
        .route("/api/cache/cleanup", post(api::cache::cleanup_cache))
        .route("/api/cache/clear", delete(api::cache::clear_cache))
        // --- FAX ---
        .route("/api/fax/recent", get(api::fax::get_recent_faxes))
        .route("/fax/{id}/color", get(api::fax::get_fax_color))
        .route("/fax/{id}/mono", get(api::fax::get_fax_mono))
        // --- Word filter ---
        .route(
            "/api/word-filter",
            get(api::word_filter::get_words).post(api::word_filter::add_word),
        )
        .route(
            "/api/word-filter/{id}",
            delete(api::word_filter::delete_word),
        )
        .route(
            "/api/word-filter/languages",
            get(api::word_filter::get_languages),
        )
        // --- Reward counts ---
        .route(
            "/api/twitch/reward-counts",
            get(api::reward::get_all_counts),
        )
        .route(
            "/api/twitch/reward-counts/reset",
            post(api::reward::reset_all_counts),
        )
        .route(
            "/api/twitch/reward-counts/{id}/reset",
            post(api::reward::reset_count),
        )
        .route(
            "/api/twitch/reward-counts/{reward_id}/users/{index}",
            delete(api::reward::remove_user_from_count),
        )
        .route(
            "/api/twitch/rewards/{id}/display-name",
            put(api::reward::set_display_name),
        )
        // --- Reward groups ---
        .route(
            "/api/twitch/reward-groups",
            get(api::reward::get_groups).post(api::reward::create_group),
        )
        .route(
            "/api/twitch/reward-groups/{id}",
            get(api::reward::get_group).delete(api::reward::delete_group),
        )
        .route(
            "/api/twitch/reward-groups/{id}/toggle",
            post(api::reward::toggle_group),
        )
        .route(
            "/api/twitch/reward-groups/{gid}/rewards",
            post(api::reward::add_reward_to_group_legacy),
        )
        .route(
            "/api/twitch/reward-groups/by-reward",
            get(api::twitch::reward_groups_by_reward),
        )
        .route(
            "/api/twitch/reward-groups/{id}/counts",
            get(api::reward::get_group_counts),
        )
        .route(
            "/api/twitch/reward-groups/{gid}/rewards/{rid}",
            post(api::reward::add_reward_to_group).delete(api::reward::remove_reward_from_group),
        )
        // --- Custom rewards ---
        .route(
            "/api/twitch/custom-rewards",
            get(api::twitch::get_custom_rewards).post(api::twitch::create_custom_reward),
        )
        .route(
            "/api/twitch/custom-rewards/create",
            post(api::twitch::create_custom_reward_legacy),
        )
        .route(
            "/api/twitch/custom-rewards/{id}",
            put(api::twitch::update_custom_reward).delete(api::twitch::delete_custom_reward),
        )
        .route(
            "/api/twitch/custom-rewards/{id}/toggle",
            patch(api::twitch::toggle_custom_reward),
        )
}
