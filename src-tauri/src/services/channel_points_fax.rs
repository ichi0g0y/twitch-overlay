//! Channel points fax generation and print orchestration.

use std::io::Cursor;

use ab_glyph::FontRef;
use image::{DynamicImage, ImageFormat};
use serde_json::Value;

use crate::app::SharedState;
use crate::services::channel_points_assets;
use crate::services::clock_fax;
use crate::services::fax::FaxService;
use crate::services::font::FontService;
use crate::services::print_queue::{self, PrintJob};

const MONO_THRESHOLD: u8 = 128;

/// Process EventSub reward redemption and print a fax when it matches configured reward ID.
pub async fn process_redemption_event(
    state: &SharedState,
    payload: &Value,
) -> Result<bool, String> {
    let reward_id = str_field(payload, &["reward", "id"]);
    let reward_title = str_field(payload, &["reward", "title"]);
    let user_name = non_empty(
        str_field(payload, &["user_name"]),
        str_field(payload, &["user_login"]),
    );
    let user_id = str_field(payload, &["user_id"]);
    let user_input = str_field(payload, &["user_input"]);

    let trigger_reward_id = {
        let config = state.config().await;
        config.trigger_custom_reward_id.clone()
    };

    if trigger_reward_id.is_empty() || reward_id != trigger_reward_id {
        tracing::debug!(
            reward_id,
            configured_reward_id = trigger_reward_id,
            "Skipping channel points fax print for non-configured reward"
        );
        return Ok(false);
    }

    let avatar_url = channel_points_assets::fetch_reward_avatar_url(state, &user_id).await;
    render_save_and_enqueue(state, &user_name, &user_input, &avatar_url)
        .await
        .map_err(|e| format!("failed to print reward redemption '{reward_title}': {e}"))?;
    Ok(true)
}

/// Process debug channel points request and print a fax.
pub async fn process_debug_channel_points(
    state: &SharedState,
    username: &str,
    display_name: &str,
    user_input: &str,
) -> Result<(), String> {
    if username.trim().is_empty() || user_input.trim().is_empty() {
        return Err("username and userInput are required".to_string());
    }
    let effective_name = if display_name.trim().is_empty() {
        username
    } else {
        display_name
    };
    let avatar_url = channel_points_assets::fetch_debug_avatar_url(state).await;
    render_save_and_enqueue(state, effective_name, user_input, &avatar_url).await
}

async fn render_save_and_enqueue(
    state: &SharedState,
    display_name: &str,
    user_input: &str,
    avatar_url: &str,
) -> Result<(), String> {
    let font_data = load_font_data(state)?;
    let font = FontRef::try_from_slice(&font_data)
        .map_err(|_| "failed to parse message font data (TTF/OTF)".to_string())?;

    let fragments = channel_points_assets::build_fragments_for_input(state, user_input).await;
    let color_image =
        image_processor::message::message_to_image(display_name, &fragments, &font, true);
    let mono_source =
        image_processor::message::message_to_image(display_name, &fragments, &font, false);

    let color_png = image_to_png_bytes(&color_image)?;
    let mono_png = image_to_png_bytes(&mono_source)?;

    let fax = save_fax(
        state,
        display_name,
        user_input,
        avatar_url,
        &color_png,
        &mono_png,
    )
    .await?;
    clock_fax::broadcast_fax(state, &fax);

    let (mono_image, mono_width) = image_to_mono_bitmap(mono_source)?;
    print_queue::enqueue(PrintJob {
        mono_image,
        mono_width,
        color_image: Some(color_png),
        description: format!("Channel points print from {display_name}"),
        force: false,
    })
    .await?;

    Ok(())
}

async fn save_fax(
    state: &SharedState,
    user_name: &str,
    message: &str,
    avatar_url: &str,
    color_png: &[u8],
    mono_png: &[u8],
) -> Result<crate::services::fax::Fax, String> {
    let fax_service = FaxService::new(state.data_dir().clone());
    fax_service
        .save_fax(user_name, message, "", avatar_url, color_png, mono_png)
        .await
        .map_err(|e| e.to_string())
}

fn load_font_data(state: &SharedState) -> Result<Vec<u8>, String> {
    let font_service = FontService::new(state.data_dir().clone());
    if let Ok(data) = font_service.get_font_data() {
        return Ok(data);
    }

    for path in system_font_candidates() {
        if let Ok(data) = std::fs::read(path) {
            tracing::info!(path = %path, "Using system font for channel points printing");
            return Ok(data);
        }
    }
    Err("no usable font found (upload custom font or install system fonts)".to_string())
}

fn system_font_candidates() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &[
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/System/Library/Fonts/Supplemental/Helvetica.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
        ]
    }
    #[cfg(target_os = "windows")]
    {
        &[
            "C:\\Windows\\Fonts\\arial.ttf",
            "C:\\Windows\\Fonts\\YuGothM.ttc",
            "C:\\Windows\\Fonts\\msgothic.ttc",
        ]
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        &[
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ]
    }
}

fn image_to_png_bytes(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("failed to encode channel points image: {e}"))?;
    Ok(cursor.into_inner())
}

fn image_to_mono_bitmap(image: DynamicImage) -> Result<(Vec<u8>, u16), String> {
    let gray = image.to_luma8();
    let width = gray.width();
    if width == 0 || width > u16::MAX as u32 {
        return Err(format!("invalid image width for print queue: {width}"));
    }
    let mono = gray
        .pixels()
        .map(|p| if p[0] < MONO_THRESHOLD { 1u8 } else { 0u8 })
        .collect::<Vec<_>>();
    Ok((mono, width as u16))
}

fn str_field(value: &Value, path: &[&str]) -> String {
    let mut cur = value;
    for key in path {
        cur = match cur.get(*key) {
            Some(v) => v,
            None => return String::new(),
        };
    }
    cur.as_str().unwrap_or_default().to_string()
}

fn non_empty(primary: String, fallback: String) -> String {
    if primary.is_empty() {
        fallback
    } else {
        primary
    }
}
