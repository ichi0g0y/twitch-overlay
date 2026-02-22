use overlay_db::Database;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::app::SharedState;
use crate::config::SettingsManager;

const TRAY_SETTINGS_WINDOW_LABEL: &str = "tray-settings";
const TRAY_SETTINGS_WINDOW_TITLE: &str = "Twitch Overlay - Settings";
const MENU_ID_SETTINGS: &str = "tray-settings";
const MENU_ID_QUIT: &str = "tray-quit";
const TRAY_ICON: tauri::image::Image<'_> = tauri::include_image!("icons/32x32.png");
const DEFAULT_WIDTH: u32 = 460;
const DEFAULT_HEIGHT: u32 = 320;
const SETTING_X: &str = "TRAY_SETTINGS_WINDOW_X";
const SETTING_Y: &str = "TRAY_SETTINGS_WINDOW_Y";
const SETTING_WIDTH: &str = "TRAY_SETTINGS_WINDOW_WIDTH";
const SETTING_HEIGHT: &str = "TRAY_SETTINGS_WINDOW_HEIGHT";

#[derive(Debug, Clone, Copy)]
struct TrayWindowState {
    x: Option<i32>,
    y: Option<i32>,
    width: u32,
    height: u32,
}

impl Default for TrayWindowState {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
        }
    }
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(MENU_ID_SETTINGS, "Settings")
        .separator()
        .text(MENU_ID_QUIT, "Quit")
        .build()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .icon(TRAY_ICON.clone())
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_ID_SETTINGS => open_settings_window(app),
            MENU_ID_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                open_settings_window(&tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn open_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(TRAY_SETTINGS_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let state = app.state::<SharedState>();
    let db = state.db().clone();
    let saved_state = load_window_state(&db);
    let mut builder = WebviewWindowBuilder::new(
        app,
        TRAY_SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("/tray-settings".into()),
    )
    .title(TRAY_SETTINGS_WINDOW_TITLE)
    .inner_size(saved_state.width as f64, saved_state.height as f64)
    .decorations(true)
    .resizable(true);

    if saved_state.x.is_none() || saved_state.y.is_none() {
        builder = builder.center();
    }

    match builder.build() {
        Ok(window) => {
            if let (Some(x), Some(y)) = (saved_state.x, saved_state.y) {
                let _ = window.set_position(PhysicalPosition::new(x, y));
            }
            install_window_event_handlers(&window, db.clone());
            persist_window_state(&window, &db);
            let _ = window.set_focus();
        }
        Err(error) => {
            tracing::error!("Failed to open tray settings window: {error}");
        }
    }
}

fn install_window_event_handlers(window: &WebviewWindow, db: Database) {
    let tracked = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            persist_window_state(&tracked, &db);
        }
    });
}

fn load_window_state(db: &Database) -> TrayWindowState {
    let sm = SettingsManager::new(db.clone());

    let x = sm
        .get_setting(SETTING_X)
        .unwrap_or_default()
        .parse::<i32>()
        .ok();
    let y = sm
        .get_setting(SETTING_Y)
        .unwrap_or_default()
        .parse::<i32>()
        .ok();
    let width = sm
        .get_setting(SETTING_WIDTH)
        .unwrap_or_default()
        .parse::<u32>()
        .ok()
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_WIDTH);
    let height = sm
        .get_setting(SETTING_HEIGHT)
        .unwrap_or_default()
        .parse::<u32>()
        .ok()
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_HEIGHT);

    TrayWindowState {
        x,
        y,
        width,
        height,
    }
}

fn persist_window_state(window: &WebviewWindow, db: &Database) {
    let sm = SettingsManager::new(db.clone());
    if let Ok(pos) = window.outer_position() {
        let _ = sm.set_setting(SETTING_X, &pos.x.to_string());
        let _ = sm.set_setting(SETTING_Y, &pos.y.to_string());
    }
    if let Ok(size) = window.inner_size() {
        let _ = sm.set_setting(SETTING_WIDTH, &size.width.to_string());
        let _ = sm.set_setting(SETTING_HEIGHT, &size.height.to_string());
    }
}
