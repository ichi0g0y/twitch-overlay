pub mod api;
pub mod assets;
pub mod router;
pub mod websocket;

use crate::app::SharedState;
use anyhow::Result;

/// Start the axum HTTP + WebSocket server.
pub async fn start_server(state: SharedState) -> Result<()> {
    let port = state.server_port();
    let shutdown_token = state.shutdown_token().clone();
    let server_shutdown_token = state.server_shutdown_token().await;
    let app = router::create_router(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Overlay server listening on http://{}", addr);

    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = shutdown_token.cancelled() => {}
                _ = server_shutdown_token.cancelled() => {}
            }
        })
        .await?;

    Ok(())
}
