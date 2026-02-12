//! Music track management API.

use axum::Json;
use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::{StatusCode, header};
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::music::MusicService;

use super::err_json;

/// POST /api/music/upload
pub async fn upload_track(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());

    let mut file_data: Option<(String, Vec<u8>)> = None;
    let mut playlist_id: Option<String> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let filename = field.file_name().unwrap_or("unknown").to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| err_json(400, &e.to_string()))?;
                file_data = Some((filename, data.to_vec()));
            }
            "playlist_id" => {
                let text = field.text().await.unwrap_or_default();
                if !text.is_empty() {
                    playlist_id = Some(text);
                }
            }
            _ => {}
        }
    }

    let (filename, data) = file_data.ok_or_else(|| err_json(400, "No file provided"))?;
    let track = svc
        .save_track(&filename, &data)
        .map_err(|e| err_json(500, &e.to_string()))?;

    // Add to playlist if specified
    if let Some(pid) = playlist_id {
        let _ = state.db().add_track_to_playlist(&pid, &track.id, 0);
    }

    let has_artwork = svc.get_artwork_path(&track.id).is_some();
    Ok(Json(json!({
        "status": "ok",
        "track": track,
        "has_artwork": has_artwork,
    })))
}

/// GET /api/music/tracks
pub async fn get_tracks(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    let tracks = svc
        .get_all_tracks()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "tracks": tracks, "count": tracks.len() })))
}

/// GET /api/music/track/:id
pub async fn get_track(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    let track = svc
        .get_track(&id)
        .map_err(|e| err_json(404, &e.to_string()))?;
    Ok(Json(json!(track)))
}

/// GET /api/music/track/:id/audio
pub async fn stream_audio(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    let path = svc
        .get_track_path(&id)
        .map_err(|e| err_json(404, &e.to_string()))?;
    let data = std::fs::read(&path).map_err(|e| err_json(500, &e.to_string()))?;

    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    let resp = axum::response::Response::builder()
        .header(header::CONTENT_TYPE, mime.as_ref())
        .header(header::CONTENT_LENGTH, data.len())
        .body(Body::from(data))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(resp)
}

/// GET /api/music/track/:id/artwork
pub async fn get_artwork(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<axum::response::Response, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    let path = svc
        .get_artwork_path(&id)
        .ok_or_else(|| err_json(404, "No artwork"))?;
    let data = std::fs::read(&path).map_err(|e| err_json(500, &e.to_string()))?;

    let resp = axum::response::Response::builder()
        .header(header::CONTENT_TYPE, "image/jpeg")
        .body(Body::from(data))
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(resp)
}

/// DELETE /api/music/track/:id
pub async fn delete_track(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    svc.delete_track(&id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "message": "Track deleted" })))
}

/// DELETE /api/music/track/all
pub async fn delete_all_tracks(
    State(state): State<SharedState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    svc.delete_all_tracks()
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "status": "ok", "message": "All tracks deleted" }),
    ))
}
