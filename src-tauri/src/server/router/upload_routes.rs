fn build_upload_routes() -> Router<SharedState> {
    Router::new()
        .route(
            "/api/settings/font",
            post(api::font::upload_font).delete(api::font::delete_font),
        )
        .route("/api/music/upload", post(api::music::upload_track))
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024))
}
