fn add_secondary_routes(router: Router<SharedState>) -> Router<SharedState> {
    router
        // --- Lottery / Present ---
        .route("/api/lottery", get(api::present::get_lottery))
        .route(
            "/api/lottery/add-participant",
            post(api::present::add_participant),
        )
        .route("/api/lottery/draw", post(api::present::draw_lottery))
        .route("/api/lottery/clear", post(api::present::clear_lottery))
        .route(
            "/api/lottery/settings",
            get(api::present::get_lottery_settings).put(api::present::update_lottery_settings),
        )
        .route(
            "/api/lottery/reset-winner",
            post(api::present::reset_lottery_winner),
        )
        .route(
            "/api/lottery/history",
            get(api::present::get_lottery_history),
        )
        .route(
            "/api/lottery/history/{id}",
            delete(api::present::delete_lottery_history),
        )
        .route(
            "/api/lottery/{user_id}",
            delete(api::present::remove_participant),
        )
        .route(
            "/api/present/test",
            post(api::present::add_test_participant),
        )
        .route(
            "/api/present/participants",
            get(api::present::get_present_participants).post(api::present::add_participant),
        )
        .route(
            "/api/present/participants/{user_id}",
            delete(api::present::delete_present_participant)
                .put(api::present::update_present_participant),
        )
        .route("/api/present/start", post(api::present::start_present))
        .route("/api/present/stop", post(api::present::stop_present))
        .route("/api/present/draw", post(api::present::draw_present))
        .route("/api/present/clear", post(api::present::clear_present))
        .route("/api/present/lock", post(api::present::lock_present))
        .route("/api/present/unlock", post(api::present::unlock_present))
        .route(
            "/api/present/refresh-subscribers",
            post(api::present::refresh_present_subscribers),
        )
        // --- Chat ---
        .route("/api/chat/messages", get(api::chat::get_messages))
        .route("/api/chat/history", get(api::chat::get_history))
        .route("/api/emotes", get(api::emotes::get_emotes))
        .route(
            "/api/emotes/favorites",
            get(api::emotes::get_emote_favorites).put(api::emotes::put_emote_favorites),
        )
        .route(
            "/api/chat/irc/credentials",
            get(api::chat::get_irc_credentials),
        )
        .route("/api/chat/irc/history", get(api::chat::get_irc_history))
        .route(
            "/api/chat/irc/channel-profiles",
            get(api::chat::get_irc_channel_profiles),
        )
        .route(
            "/api/chat/irc/channel-profile",
            post(api::chat::post_irc_channel_profile),
        )
        .route("/api/chat/irc/message", post(api::chat::post_irc_message))
        .route("/api/chat/post", post(api::chat::post_chat_message))
        .route(
            "/api/chat/moderation/action",
            post(api::chat::post_chat_moderation_action),
        )
        .route(
            "/api/chat/user-profile",
            post(api::chat::upsert_user_profile),
        )
        .route(
            "/api/chat/user-profile/detail",
            post(api::chat::get_user_profile_detail),
        )
        .route("/api/chat/cleanup", post(api::chat::cleanup_messages))
        .route("/api/chat/avatar/{user_id}", get(api::chat::get_avatar))
        // --- Twitch ---
        .route("/api/twitch/verify", get(api::twitch::verify_twitch))
        .route("/api/twitch/chatters", get(api::twitch::chatters))
        .route(
            "/api/twitch/followed-channels",
            get(api::twitch::followed_channels),
        )
        .route("/api/twitch/raid/start", post(api::twitch::start_raid))
        .route(
            "/api/twitch/shoutout/start",
            post(api::twitch::start_shoutout),
        )
        .route(
            "/api/twitch/refresh-token",
            get(api::twitch::refresh_token).post(api::twitch::refresh_token),
        )
        .route(
            "/api/twitch/stream-status-by-login",
            get(api::twitch::stream_status_by_login),
        )
        .route("/api/stream/status", get(api::twitch::stream_status))
        // --- Printer ---
        .route("/api/printer/scan", post(api::printer::scan_printers))
        .route("/api/printer/test", post(api::printer::test_printer))
        .route("/api/printer/status", get(api::printer::printer_status))
        .route(
            "/api/printer/reconnect",
            post(api::printer::reconnect_printer),
        )
        .route("/api/printer/test-print", post(api::printer::test_print))
        .route(
            "/api/printer/system-printers",
            get(api::printer::list_system_printers),
        )
        // --- Logs ---
        .route("/api/logs", get(api::logs::get_logs))
        .route("/api/logs/stream", get(api::logs::stream_logs))
        .route("/api/logs/download", get(api::logs::download_logs))
        .route("/api/logs/clear", post(api::logs::clear_logs))
        // --- Debug ---
        .route("/debug/fax", post(api::debug::debug_fax))
        .route(
            "/debug/channel-points",
            post(api::debug::debug_channel_points),
        )
        .route("/debug/clock", post(api::debug::debug_clock))
        .route("/debug/follow", post(api::debug::debug_follow))
        .route("/debug/cheer", post(api::debug::debug_cheer))
        .route("/debug/subscribe", post(api::debug::debug_subscribe))
        .route("/debug/raid", post(api::debug::debug_raid))
        .route("/debug/gift-sub", post(api::debug::debug_gift_sub))
        .route("/debug/resub", post(api::debug::debug_resub))
        .route("/debug/shoutout", post(api::debug::debug_shoutout))
        .route(
            "/debug/stream-online",
            post(api::debug::debug_stream_online),
        )
        .route(
            "/debug/stream-offline",
            post(api::debug::debug_stream_offline),
        )
        .route(
            "/api/debug/printer-status",
            post(api::debug::debug_printer_status),
        )
}
