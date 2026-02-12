//! Static file serving for the OBS overlay (web/dist).

use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../web/dist/"]
struct OverlayAssets;

/// Serve files from the embedded web/dist directory under `/overlay/`.
pub async fn overlay_handler(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Response {
    serve_embedded(&path)
}

/// Serve the overlay index for bare `/overlay/` requests.
pub async fn overlay_index() -> Response {
    serve_embedded("index.html")
}

fn serve_embedded(path: &str) -> Response {
    // Try exact path first, then fall back to index.html (SPA)
    let asset = OverlayAssets::get(path)
        .or_else(|| OverlayAssets::get("index.html"));

    match asset {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime.as_ref())],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
