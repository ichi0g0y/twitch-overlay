use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};

use crate::app::SharedState;

/// WebSocket upgrade handler.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: SharedState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.subscribe_ws();

    // Send connection confirmation
    let client_id = uuid::Uuid::new_v4().to_string();
    let welcome = serde_json::json!({
        "type": "connected",
        "data": { "clientId": client_id }
    });
    if sender
        .send(Message::Text(welcome.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    tracing::info!("WebSocket client connected: {}", client_id);

    // Forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Receive messages from this client and handle routing
    let ws_tx = state.ws_sender().clone();
    let cid = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    handle_client_message(&text, &ws_tx);
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
        tracing::info!("WebSocket client disconnected: {}", cid);
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

/// Route incoming client messages.
fn handle_client_message(text: &str, ws_tx: &tokio::sync::broadcast::Sender<String>) {
    // Try to parse as JSON to detect message type
    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) {
        let msg_type = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match msg_type {
            // Ping/pong handled at application level
            "ping" => {
                let pong = serde_json::json!({ "type": "pong" });
                let _ = ws_tx.send(pong.to_string());
            }
            // Forward transcript/translation messages to all clients
            "mic_transcript" | "mic_transcript_translation" => {
                let _ = ws_tx.send(text.to_string());
            }
            _ => {
                // Forward unknown messages to all clients
                let _ = ws_tx.send(text.to_string());
            }
        }
    } else {
        // Non-JSON messages are forwarded as-is
        let _ = ws_tx.send(text.to_string());
    }
}
