//! Static file serving for overlay (web/dist) and dashboard (frontend/dist).

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

// --- Overlay (web/dist) ---

#[derive(Embed)]
#[folder = "../web/dist/"]
struct OverlayAssets;

pub async fn overlay_handler(axum::extract::Path(path): axum::extract::Path<String>) -> Response {
    serve_embedded::<OverlayAssets>(&path)
}

pub async fn overlay_index() -> Response {
    serve_embedded::<OverlayAssets>("index.html")
}

// --- Dashboard / Settings UI (frontend/dist) ---

#[derive(Embed)]
#[folder = "../frontend/dist/"]
struct DashboardAssets;

/// Serve dashboard index for bare `/` requests.
pub async fn dashboard_index() -> Response {
    serve_embedded::<DashboardAssets>("index.html")
}

/// Fallback handler: serve dashboard assets for unmatched paths (SPA support).
/// Uses `Uri` instead of `Path` because fallback has no capture parameter.
pub async fn dashboard_fallback(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Never serve SPA HTML for backend routes.
    const NON_SPA_PREFIXES: [&str; 9] = [
        "api", "api/", "auth", "callback", "debug", "debug/", "ws", "fax", "fax/",
    ];
    if NON_SPA_PREFIXES
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(prefix))
    {
        return (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "application/json")],
            br#"{"status":"error","error":"route not found"}"#.to_vec(),
        )
            .into_response();
    }

    serve_embedded::<DashboardAssets>(path)
}

// --- Common ---

fn serve_embedded<E: Embed>(path: &str) -> Response {
    let asset = E::get(path).or_else(|| E::get("index.html"));

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
