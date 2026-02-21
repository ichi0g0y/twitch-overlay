//! Music playlist management API.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::app::SharedState;
use crate::services::music::MusicService;
use crate::services::music_playlist::PlaylistService;

use super::err_json;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

/// GET /api/music/playlists
pub async fn get_playlists(State(state): State<SharedState>) -> ApiResult {
    let svc = PlaylistService::new(state.db().clone());
    let playlists = svc
        .get_all_playlists()
        .map_err(|e| err_json(500, &e.to_string()))?;
    let count = playlists.len();
    Ok(Json(json!({ "playlists": playlists, "count": count })))
}

/// POST /api/music/playlist
pub async fn create_playlist(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> ApiResult {
    let name = body["name"].as_str().unwrap_or("Untitled");
    let description = body["description"].as_str().unwrap_or("");
    let svc = PlaylistService::new(state.db().clone());
    let playlist = svc
        .create_playlist(name, description)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(json!(playlist)))
}

/// GET /api/music/playlist/:id
pub async fn get_playlist(State(state): State<SharedState>, Path(id): Path<String>) -> ApiResult {
    let svc = PlaylistService::new(state.db().clone());
    let playlist = svc
        .get_playlist(&id)
        .map_err(|e| err_json(404, &e.to_string()))?;
    Ok(Json(json!(playlist)))
}

/// GET /api/music/playlist/:id/tracks
pub async fn get_playlist_tracks(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    let svc = PlaylistService::new(state.db().clone());
    let music_svc = MusicService::new(state.db().clone(), state.data_dir().clone());
    let playlist = svc
        .get_playlist(&id)
        .map_err(|e| err_json(404, &e.to_string()))?;
    let tracks = svc
        .get_tracks_full(&id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    let tracks_with_artwork: Vec<Value> = tracks
        .into_iter()
        .map(|track| {
            let has_artwork = music_svc.get_artwork_path(&track.id).is_some();
            let mut value = serde_json::to_value(track).unwrap_or_else(|_| json!({}));
            if let Some(obj) = value.as_object_mut() {
                obj.insert("has_artwork".to_string(), json!(has_artwork));
            }
            value
        })
        .collect();
    Ok(Json(
        json!({ "playlist": playlist, "tracks": tracks_with_artwork }),
    ))
}

/// PUT /api/music/playlist/:id
pub async fn modify_playlist(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<HashMap<String, Value>>,
) -> ApiResult {
    let svc = PlaylistService::new(state.db().clone());
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "add_track" => {
            let track_id = body.get("track_id").and_then(|v| v.as_str()).unwrap_or("");
            let position = body.get("position").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            svc.add_track(&id, track_id, position)
                .map_err(|e| err_json(400, &e.to_string()))?;
        }
        "remove_track" => {
            let track_id = body.get("track_id").and_then(|v| v.as_str()).unwrap_or("");
            svc.remove_track(&id, track_id)
                .map_err(|e| err_json(400, &e.to_string()))?;
        }
        "reorder_track" => {
            let track_id = body.get("track_id").and_then(|v| v.as_str()).unwrap_or("");
            let position = body.get("position").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            svc.update_track_order(&id, track_id, position)
                .map_err(|e| err_json(400, &e.to_string()))?;
        }
        _ => return Err(err_json(400, &format!("Unknown action: {action}"))),
    }

    Ok(Json(
        json!({ "status": "ok", "message": "Playlist updated" }),
    ))
}

/// DELETE /api/music/playlist/:id
pub async fn delete_playlist(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> ApiResult {
    let svc = PlaylistService::new(state.db().clone());
    svc.delete_playlist(&id)
        .map_err(|e| err_json(500, &e.to_string()))?;
    Ok(Json(
        json!({ "status": "ok", "message": "Playlist deleted" }),
    ))
}
