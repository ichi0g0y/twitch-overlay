pub mod api;
pub mod assets;
pub mod router;
pub mod websocket;

use crate::app::SharedState;
use anyhow::Result;

/// Start the axum HTTP + WebSocket server.
pub async fn start_server(state: SharedState) -> Result<()> {
    let port = state.server_port();
    let app = router::create_router(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Overlay server listening on http://{}", addr);

    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}
