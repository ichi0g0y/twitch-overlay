//! Log viewing API backed by tracing subscriber in-memory buffer.

use axum::Json;
use axum::extract::{
    Query, State,
    ws::{Message, WebSocket, WebSocketUpgrade},
};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::SharedState;
use crate::services::log_buffer;

type ApiResult = Result<Json<Value>, (axum::http::StatusCode, Json<Value>)>;

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct LogDownloadQuery {
    pub format: Option<String>,
}

/// GET /api/logs
pub async fn get_logs(State(_state): State<SharedState>, Query(q): Query<LogQuery>) -> ApiResult {
    let limit = q.limit.unwrap_or(100).clamp(1, 1000);
    let logs = log_buffer::recent(limit);

    Ok(Json(json!({
        "logs": logs,
        "count": logs.len(),
        "limit": limit,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    })))
}

/// POST /api/logs/clear
pub async fn clear_logs(State(_state): State<SharedState>) -> ApiResult {
    let cleared = log_buffer::clear();
    Ok(Json(json!({
        "status": "ok",
        "message": "Logs cleared",
        "cleared": cleared,
    })))
}

/// GET /api/logs/download
pub async fn download_logs(Query(q): Query<LogDownloadQuery>) -> Response {
    let now = chrono::Utc::now().to_rfc3339();
    let format = q.format.as_deref().unwrap_or("text");
    let logs = log_buffer::all();
    let count = logs.len();

    if format == "json" {
        let body = json!({
            "logs": logs,
            "generated_at": now,
            "count": count,
        })
        .to_string();
        return (
            [
                (header::CONTENT_TYPE, "application/json"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"logs.json\"",
                ),
            ],
            body,
        )
            .into_response();
    }

    let mut body = format!("# twitch-overlay logs\n# generated_at={now}\n");
    for log in logs {
        if log.fields.is_empty() {
            body.push_str(&format!(
                "{} [{}] ({}) {}\n",
                log.timestamp, log.level, log.target, log.message
            ));
        } else {
            body.push_str(&format!(
                "{} [{}] ({}) {} {}\n",
                log.timestamp,
                log.level,
                log.target,
                log.message,
                Value::Object(log.fields).to_string()
            ));
        }
    }

    (
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"logs.txt\"",
            ),
        ],
        body,
    )
        .into_response()
}

/// GET /api/logs/stream (WebSocket)
pub async fn stream_logs(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_stream_socket)
}

async fn handle_stream_socket(socket: WebSocket) {
    let (mut sender, mut receiver) = socket.split();

    for log in log_buffer::recent(100) {
        let Ok(payload) = serde_json::to_string(&log) else {
            continue;
        };
        if sender.send(Message::Text(payload.into())).await.is_err() {
            return;
        }
    }

    let mut log_rx = log_buffer::subscribe();

    loop {
        tokio::select! {
            maybe_msg = receiver.next() => {
                match maybe_msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            recv = log_rx.recv() => {
                match recv {
                    Ok(log) => {
                        let Ok(payload) = serde_json::to_string(&log) else {
                            continue;
                        };
                        if sender.send(Message::Text(payload.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }
}
