//! Log viewing API (placeholder – actual log collection TBD).

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::app::SharedState;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub limit: Option<usize>,
}

/// GET /api/logs
pub async fn get_logs(
    State(_state): State<SharedState>,
    Query(q): Query<LogQuery>,
) -> ApiResult {
    let limit = q.limit.unwrap_or(100);
    // TODO: Integrate with tracing subscriber to collect logs
    Ok(Json(json!({
        "logs": [],
        "count": 0,
        "limit": limit,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    })))
}

/// POST /api/logs/clear
pub async fn clear_logs(State(_state): State<SharedState>) -> ApiResult {
    // TODO: Integrate with tracing subscriber
    Ok(Json(json!({ "status": "ok", "message": "Logs cleared" })))
}
