use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use serde_json::json;

use crate::app::SharedState;

use super::{ApiResult, err_json};

#[derive(Debug, Deserialize)]
pub struct LotteryHistoryQuery {
    pub limit: Option<i64>,
}

/// GET /api/lottery/history?limit=N
pub async fn get_lottery_history(
    State(state): State<SharedState>,
    Query(query): Query<LotteryHistoryQuery>,
) -> ApiResult {
    let limit = query.limit.unwrap_or(0);
    if limit < 0 {
        return Err(err_json(400, "Invalid limit"));
    }

    let history = state
        .db()
        .get_lottery_history(limit)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({ "history": history })))
}

/// DELETE /api/lottery/history/:id
pub async fn delete_lottery_history(
    State(state): State<SharedState>,
    Path(id): Path<i64>,
) -> ApiResult {
    if id <= 0 {
        return Err(err_json(400, "Invalid history ID"));
    }

    state
        .db()
        .delete_lottery_history(id)
        .map_err(|e| err_json(500, &e.to_string()))?;

    Ok(Json(json!({ "success": true, "id": id })))
}
