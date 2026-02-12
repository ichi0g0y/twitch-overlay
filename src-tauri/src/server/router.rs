use axum::{
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::CorsLayer;

use crate::app::SharedState;
use super::{api, assets, websocket};

/// Create the axum router with all routes.
pub fn create_router(state: SharedState) -> Router {
    Router::new()
        // --- Core ---
        .route("/status", get(status_handler))
        .route("/ws", get(websocket::ws_handler))
        // --- Settings ---
        .route("/api/settings/v2", get(api::settings::get_settings).put(api::settings::update_settings))
        .route("/api/settings/v2/reset", post(api::settings::reset_settings))
        .route("/api/settings/status", get(api::settings::get_settings_status))
        .route("/api/settings/auth/status", get(api::twitch::auth_status))
        // --- Font ---
        .route("/api/settings/font", post(api::font::upload_font).delete(api::font::delete_font))
        .route("/api/font/data", get(api::font::get_font_data))
        // --- Overlay ---
        .route("/api/settings/overlay", get(api::overlay::get_overlay_settings).post(api::overlay::update_overlay_settings))
        .route("/api/overlay/refresh", post(api::overlay::refresh_overlay))
        // --- Music tracks ---
        .route("/api/music/upload", post(api::music::upload_track))
        .route("/api/music/tracks", get(api::music::get_tracks))
        .route("/api/music/track/all", delete(api::music::delete_all_tracks))
        .route("/api/music/track/{id}", get(api::music::get_track).delete(api::music::delete_track))
        .route("/api/music/track/{id}/audio", get(api::music::stream_audio))
        .route("/api/music/track/{id}/artwork", get(api::music::get_artwork))
        // --- Music playlists ---
        .route("/api/music/playlists", get(api::music_playlist::get_playlists))
        .route("/api/music/playlist", post(api::music_playlist::create_playlist))
        .route("/api/music/playlist/{id}", get(api::music_playlist::get_playlist).put(api::music_playlist::modify_playlist).delete(api::music_playlist::delete_playlist))
        .route("/api/music/playlist/{id}/tracks", get(api::music_playlist::get_playlist_tracks))
        // --- Music state & control ---
        .route("/api/music/state", get(api::music_state::get_playback_state))
        .route("/api/music/state/update", post(api::music_state::save_playback_state))
        .route("/api/music/status", get(api::music_state::get_music_status))
        .route("/api/music/status/update", post(api::music_state::update_music_status))
        .route("/api/music/control/{action}", post(api::music_state::music_control))
        // --- Cache ---
        .route("/api/cache/stats", get(api::cache::get_cache_stats))
        .route("/api/cache/settings", get(api::cache::get_cache_settings).put(api::cache::update_cache_settings))
        .route("/api/cache/cleanup", post(api::cache::cleanup_cache))
        .route("/api/cache/clear", delete(api::cache::clear_cache))
        // --- FAX ---
        .route("/api/fax/recent", get(api::fax::get_recent_faxes))
        .route("/fax/{id}/color", get(api::fax::get_fax_color))
        .route("/fax/{id}/mono", get(api::fax::get_fax_mono))
        // --- Word filter ---
        .route("/api/word-filter", get(api::word_filter::get_words).post(api::word_filter::add_word))
        .route("/api/word-filter/{id}", delete(api::word_filter::delete_word))
        .route("/api/word-filter/languages", get(api::word_filter::get_languages))
        // --- Reward counts ---
        .route("/api/twitch/reward-counts", get(api::reward::get_all_counts))
        .route("/api/twitch/reward-counts/reset", post(api::reward::reset_all_counts))
        .route("/api/twitch/reward-counts/{id}/reset", post(api::reward::reset_count))
        .route("/api/twitch/reward-counts/{reward_id}/users/{index}", delete(api::reward::remove_user_from_count))
        .route("/api/twitch/rewards/{id}/display-name", put(api::reward::set_display_name))
        // --- Reward groups ---
        .route("/api/twitch/reward-groups", get(api::reward::get_groups).post(api::reward::create_group))
        .route("/api/twitch/reward-groups/{id}", delete(api::reward::delete_group))
        .route("/api/twitch/reward-groups/{id}/toggle", post(api::reward::toggle_group))
        .route("/api/twitch/reward-groups/{id}/counts", get(api::reward::get_group_counts))
        .route("/api/twitch/reward-groups/{gid}/rewards/{rid}", post(api::reward::add_reward_to_group).delete(api::reward::remove_reward_from_group))
        // --- Lottery / Present ---
        .route("/api/lottery", get(api::present::get_lottery))
        .route("/api/lottery/add-participant", post(api::present::add_participant))
        .route("/api/lottery/clear", post(api::present::clear_lottery))
        .route("/api/lottery/{user_id}", delete(api::present::remove_participant))
        // --- Chat ---
        .route("/api/chat/messages", get(api::chat::get_messages))
        .route("/api/chat/cleanup", post(api::chat::cleanup_messages))
        .route("/api/chat/avatar/{user_id}", get(api::chat::get_avatar))
        // --- Twitch ---
        .route("/api/twitch/verify", get(api::twitch::verify_twitch))
        .route("/api/twitch/refresh-token", post(api::twitch::refresh_token))
        .route("/api/stream/status", get(api::twitch::stream_status))
        // --- Printer ---
        .route("/api/printer/scan", post(api::printer::scan_printers))
        .route("/api/printer/test", post(api::printer::test_printer))
        .route("/api/printer/status", get(api::printer::printer_status))
        .route("/api/printer/reconnect", post(api::printer::reconnect_printer))
        .route("/api/printer/test-print", post(api::printer::test_print))
        // --- Logs ---
        .route("/api/logs", get(api::logs::get_logs))
        .route("/api/logs/clear", post(api::logs::clear_logs))
        // --- Debug ---
        .route("/debug/fax", post(api::debug::debug_fax))
        .route("/debug/channel-points", post(api::debug::debug_channel_points))
        .route("/debug/follow", post(api::debug::debug_follow))
        .route("/debug/cheer", post(api::debug::debug_cheer))
        .route("/debug/subscribe", post(api::debug::debug_subscribe))
        .route("/debug/raid", post(api::debug::debug_raid))
        .route("/debug/stream-online", post(api::debug::debug_stream_online))
        .route("/debug/stream-offline", post(api::debug::debug_stream_offline))
        .route("/api/debug/printer-status", post(api::debug::debug_printer_status))
        // --- Overlay static files ---
        .route("/overlay/", get(assets::overlay_index))
        .route("/overlay/{*path}", get(assets::overlay_handler))
        // --- Dashboard (Settings UI) at / ---
        .route("/", get(assets::dashboard_index))
        .fallback(assets::dashboard_fallback)
        // --- Middleware ---
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn status_handler() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "version": "1.0.0"
    }))
}
