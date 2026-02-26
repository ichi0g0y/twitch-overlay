//! Overlay settings API:
//!   GET  /api/settings/overlay         – get overlay settings
//!   POST /api/settings/overlay         – update overlay settings (partial)
//!   POST /api/overlay/refresh          – re-broadcast settings to all WS clients

include!("overlay/prelude.rs");
include!("overlay/handlers.rs");
include!("overlay/helpers.rs");
include!("overlay/tests.rs");
