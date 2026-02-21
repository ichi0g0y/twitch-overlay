//! Font management API.

use ab_glyph::FontRef;
use axum::Json;
use axum::body::Body;
use axum::extract::{Multipart, State};
use axum::http::{StatusCode, header};
use base64::Engine;
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::font::FontService;

use super::err_json;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;
const DEFAULT_PREVIEW_TEXT: &str = "サンプルテキスト Sample Text 123";

/// POST /api/settings/font – Upload custom font
pub async fn upload_font(State(state): State<SharedState>, mut multipart: Multipart) -> ApiResult {
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

/// POST /api/settings/font/preview
pub async fn preview_font(State(state): State<SharedState>, Json(body): Json<Value>) -> ApiResult {
    let text = body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
        .if_empty(DEFAULT_PREVIEW_TEXT);

    let svc = FontService::new(state.data_dir().clone());
    let font_data = svc
        .get_font_data()
        .map_err(|e| err_json(400, &format!("Failed to load custom font: {e}")))?;

    let font = FontRef::try_from_slice(&font_data)
        .map_err(|_| err_json(400, "Invalid font data (failed to parse TTF/OTF)"))?;

    let preview_img = image_engine::clock::generate_preview_image(&text, &font);
    let mut buf = std::io::Cursor::new(Vec::<u8>::new());
    preview_img
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| err_json(500, &format!("Failed to encode preview image: {e}")))?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(Json(
        json!({ "image": format!("data:image/png;base64,{encoded}") }),
    ))
}

trait EmptyToDefault {
    fn if_empty(self, default: &'static str) -> String;
}

impl EmptyToDefault for String {
    fn if_empty(self, default: &'static str) -> String {
        if self.is_empty() {
            default.to_string()
        } else {
            self
        }
    }
}
