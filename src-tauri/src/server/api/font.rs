//! Font management API.

use axum::body::Body;
use axum::extract::{Multipart, State};
use axum::http::{header, StatusCode};
use axum::Json;
use serde_json::{json, Value};

use crate::app::SharedState;
use crate::services::font::FontService;

use super::err_json;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// POST /api/settings/font – Upload custom font
pub async fn upload_font(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> ApiResult {
    let svc = FontService::new(state.data_dir().clone());

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "font" {
            let filename = field.file_name().unwrap_or("font.ttf").to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| err_json(400, &e.to_string()))?;
            let info = svc
                .save_custom_font(&filename, &data)
                .map_err(|e| err_json(400, &e.to_string()))?;

            let _ = state.db().set_setting("FONT_FILENAME", &filename, "normal");

            return Ok(Json(json!({ "success": true, "font": info })));
        }
    }

    Err(err_json(400, "No font file provided"))
}

/// DELETE /api/settings/font – Delete custom font
pub async fn delete_font(State(state): State<SharedState>) -> ApiResult {
    let svc = FontService::new(state.data_dir().clone());
    svc.delete_custom_font()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let _ = state.db().set_setting("FONT_FILENAME", "", "normal");
    Ok(Json(json!({ "success": true, "message": "Font deleted" })))
}

/// GET /api/font/data – Serve the custom font file
pub async fn get_font_data(
    State(state): State<SharedState>,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    let svc = FontService::new(state.data_dir().clone());
    let info = svc
        .get_font_info()
        .map_err(|e| err_json(404, &e.to_string()))?;

    let data = svc
        .get_font_data()
        .map_err(|e| err_json(404, &e.to_string()))?;

    let filename = info.filename.unwrap_or_else(|| "font.ttf".to_string());
    let mime = if filename.ends_with(".otf") {
        "font/otf"
    } else {
        "font/ttf"
    };

    let resp = axum::response::Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(data))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(resp)
}
