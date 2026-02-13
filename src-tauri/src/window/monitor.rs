//! Multi-monitor support via Tauri Monitor API.
//!
//! Replaces Go `window_darwin.go` CGO functions.

use serde::Serialize;
use tauri::{AppHandle, Window};

/// Information about a connected monitor.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenInfo {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Get all connected monitors with their absolute positions.
pub fn get_all_screens(app: &AppHandle) -> Vec<ScreenInfo> {
    let monitors = app.available_monitors().unwrap_or_default();
    monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| {
            let pos = m.position();
            let size = m.size();
            ScreenInfo {
                index: i,
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
            }
        })
        .collect()
}

/// Find which monitor contains the majority of the given rectangle.
pub fn find_screen_containing(
    screens: &[ScreenInfo],
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Option<usize> {
    let mut best_index = None;
    let mut best_area: i64 = 0;

    for screen in screens {
        let overlap_x = (x + w as i32).min(screen.x + screen.width as i32) - x.max(screen.x);
        let overlap_y = (y + h as i32).min(screen.y + screen.height as i32) - y.max(screen.y);

        if overlap_x > 0 && overlap_y > 0 {
            let area = overlap_x as i64 * overlap_y as i64;
            if area > best_area {
                best_area = area;
                best_index = Some(screen.index);
            }
        }
    }

    best_index
}

/// Generate MD5 hash of the monitor configuration.
/// Used to detect when monitor layout changes (reset window positions).
pub fn generate_screen_config_hash(screens: &[ScreenInfo]) -> String {
    let mut input = String::new();
    for s in screens {
        input.push_str(&format!(
            "{}:{}:{}:{}:{}\n",
            s.x, s.y, s.width, s.height, s.scale_factor
        ));
    }
    format!("{:x}", md5::compute(input.as_bytes()))
}

/// Get the outer position of a window.
pub fn get_window_position(window: &Window) -> Option<(i32, i32)> {
    window.outer_position().ok().map(|p| (p.x, p.y))
}

/// Get the outer size of a window.
pub fn get_window_size(window: &Window) -> Option<(u32, u32)> {
    window.outer_size().ok().map(|s| (s.width, s.height))
}
