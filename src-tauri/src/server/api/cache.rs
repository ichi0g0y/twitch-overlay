//! Image cache management API.

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::cache::{CacheService, CacheSettings};

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// GET /api/cache/stats
pub async fn get_cache_stats(State(state): State<SharedState>) -> ApiResult {
    let svc = CacheService::new(state.db().clone(), state.data_dir().clone());
    let stats = svc.get_stats().map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(stats)))
}

/// GET /api/cache/settings
pub async fn get_cache_settings(State(state): State<SharedState>) -> ApiResult {
    let svc = CacheService::new(state.db().clone(), state.data_dir().clone());
    let settings = svc.get_settings();
    Ok(Json(json!(settings)))
}

/// PUT /api/cache/settings
pub async fn update_cache_settings(
    State(state): State<SharedState>,
    Json(body): Json<CacheSettings>,
) -> ApiResult {
    let svc = CacheService::new(state.db().clone(), state.data_dir().clone());
    svc.update_settings(&body)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok" })))
}

/// POST /api/cache/cleanup
pub async fn cleanup_cache(State(state): State<SharedState>) -> ApiResult {
    let svc = CacheService::new(state.db().clone(), state.data_dir().clone());
    svc.cleanup_expired()
        .map_err(|e| err_json(500, &e.to_string()))?;
    svc.cleanup_oversize()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let stats = svc.get_stats().map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "stats": stats })))
}

/// DELETE /api/cache/clear
pub async fn clear_cache(State(state): State<SharedState>) -> ApiResult {
    let svc = CacheService::new(state.db().clone(), state.data_dir().clone());
    svc.clear_all().map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "message": "Cache cleared" })))
}
