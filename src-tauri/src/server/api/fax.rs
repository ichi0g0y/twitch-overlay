//! FAX image serving API.

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::fax::FaxService;

use super::err_json;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// GET /api/fax/recent
pub async fn get_recent_faxes(State(state): State<SharedState>) -> ApiResult {
    let svc = FaxService::new(state.data_dir().clone());
    let faxes = svc.get_recent_faxes(20).await;
    let count = faxes.len();
    Ok(Json(json!({ "faxes": faxes, "count": count })))
}

/// GET /fax/:id/color
pub async fn get_fax_color(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    serve_fax_image(state, &id, "color").await
}

/// GET /fax/:id/mono
pub async fn get_fax_mono(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    serve_fax_image(state, &id, "mono").await
}

async fn serve_fax_image(
    state: SharedState,
    id: &str,
    variant: &str,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    let svc = FaxService::new(state.data_dir().clone());
    let path = svc
        .get_image_path(id, variant)
        .await
        .map_err(|e| err_json(404, &e.to_string()))?;
    let data = std::fs::read(&path).map_err(|e| err_json(500, &e.to_string()))?;

    let resp = axum::response::Response::builder()
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(data))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(resp)
}
