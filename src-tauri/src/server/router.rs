use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{delete, get, patch, post, put},
};
use tower_http::cors::CorsLayer;

use super::{api, assets, websocket};
use crate::app::SharedState;

include!("router/upload_routes.rs");
include!("router/primary_routes.rs");
include!("router/secondary_routes.rs");
include!("router/final_routes.rs");

/// Create the axum router with all routes.
pub fn create_router(state: SharedState) -> Router {
    let router = Router::new().merge(build_upload_routes());
    let router = add_primary_routes(router);
    let router = add_secondary_routes(router);
    let router = add_final_routes(router);

    router
        // --- Middleware ---
        .layer(CorsLayer::permissive())
        .with_state(state)
}

include!("router/status_handler.rs");
