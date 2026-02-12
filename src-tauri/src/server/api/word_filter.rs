//! Word filter CRUD API.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::app::SharedState;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct LangQuery {
    pub lang: Option<String>,
}

/// GET /api/word-filter?lang=xx
pub async fn get_words(
    State(state): State<SharedState>,
    Query(q): Query<LangQuery>,
) -> ApiResult {
    let lang = q.lang.unwrap_or_else(|| "en".to_string());
    let words = state
        .db()
        .get_word_filter_words(&lang)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "words": words, "language": lang, "count": words.len() })))
}

/// POST /api/word-filter
pub async fn add_word(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let language = body["language"].as_str().unwrap_or("en");
    let word = body["word"]
        .as_str()
        .ok_or_else(|| err_json(400, "word is required"))?;
    let word_type = body["type"].as_str().unwrap_or("bad");

    if word_type != "bad" && word_type != "good" {
        return Err(err_json(400, "type must be 'bad' or 'good'"));
    }

    let w = state
        .db()
        .add_word_filter_word(language, word, word_type)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "word": w })))
}

/// DELETE /api/word-filter/:id
pub async fn delete_word(
    State(state): State<SharedState>,
    Path(id): Path<i64>,
) -> ApiResult {
    state
        .db()
        .delete_word_filter_word(id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "message": "Word deleted" })))
}

/// GET /api/word-filter/languages
pub async fn get_languages(State(state): State<SharedState>) -> ApiResult {
    let langs = state
        .db()
        .get_word_filter_languages()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "languages": langs })))
}
