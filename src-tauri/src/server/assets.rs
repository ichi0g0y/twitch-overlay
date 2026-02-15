//! Static file serving for overlay (web/dist) and dashboard (frontend/dist).

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;
use serde_json::json;

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
    let request_path = uri.path();
    if should_return_non_spa_not_found(request_path) {
        return (
            StatusCode::NOT_FOUND,
            axum::Json(json!({
                "error": "Not Found",
                "path": request_path,
            })),
        )
            .into_response();
    }

    serve_embedded::<DashboardAssets>(request_path.trim_start_matches('/'))
}

fn should_return_non_spa_not_found(path: &str) -> bool {
    const NON_SPA_PREFIXES: [&str; 6] = ["/api", "/auth", "/callback", "/debug", "/ws", "/fax"];

    NON_SPA_PREFIXES.iter().any(|prefix| {
        path == *prefix
            || path
                .strip_prefix(prefix)
                .is_some_and(|rest| rest.starts_with('/'))
    })
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

#[cfg(test)]
mod tests {
    use super::{dashboard_fallback, should_return_non_spa_not_found};
    use axum::body::to_bytes;
    use axum::http::{StatusCode, Uri, header};

    #[test]
    fn should_detect_non_spa_paths_by_root_segment() {
        let positive = [
            "/api",
            "/api/nonexistent",
            "/auth",
            "/auth/return",
            "/callback",
            "/debug/clock",
            "/ws",
            "/ws/events",
            "/fax",
            "/fax/abc/mono",
        ];
        for path in positive {
            assert!(
                should_return_non_spa_not_found(path),
                "{path} should be non-SPA"
            );
        }

        let negative = [
            "/",
            "/overlay",
            "/apiary",
            "/callback2",
            "/debugger",
            "/wsx",
            "/faxes",
        ];
        for path in negative {
            assert!(
                !should_return_non_spa_not_found(path),
                "{path} should not be non-SPA"
            );
        }
    }

    #[tokio::test]
    async fn dashboard_fallback_returns_required_404_json() {
        let response = dashboard_fallback(Uri::from_static("/api/nonexistent")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );

        let body_bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body["error"], "Not Found");
        assert_eq!(body["path"], "/api/nonexistent");
    }
}
