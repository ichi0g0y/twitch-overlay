fn add_final_routes(router: Router<SharedState>) -> Router<SharedState> {
    router
        // --- Overlay static files ---
        .route("/overlay/", get(assets::overlay_index))
        .route("/overlay/{*path}", get(assets::overlay_handler))
        // --- Dashboard (Settings UI) at / ---
        .route("/", get(assets::dashboard_index))
        .fallback(assets::dashboard_fallback)
}
