//! Clock print helpers and periodic routine.
//!
//! Provides a Wails-compatible hourly clock print behavior by generating
//! clock fax images, broadcasting them, and enqueuing print jobs.

use std::io::Cursor;
use std::time::Duration;

use ab_glyph::FontRef;
use chrono::Timelike;
use chrono_tz::Tz;
use image::{DynamicImage, ImageFormat};
use image_processor::clock::BitsLeaderEntry;
use tokio::time::sleep;

use crate::app::SharedState;
use crate::services::clock_bits;
use crate::services::clock_fax;
use crate::services::font::FontService;
use crate::services::print_queue::{self, PrintJob};

const CLOCK_LOOP_START_DELAY_SECS: u64 = 10;
const CLOCK_LOOP_INTERVAL_SECS: u64 = 1;
const MONO_THRESHOLD: u8 = 128;
const MAX_BITS_LEADERS: u32 = 5;

/// Periodically enqueue a clock print on each hour.
pub async fn clock_routine_loop(state: SharedState) {
    sleep(Duration::from_secs(CLOCK_LOOP_START_DELAY_SECS)).await;
    let mut last_printed_minute: Option<String> = None;

    loop {
        let (clock_enabled, timezone) = {
            let config = state.config().await;
            (config.clock_enabled, config.timezone.clone())
        };

        if clock_enabled {
            let now = now_in_timezone(&timezone);
            if now.minute() == 0 {
                let minute_key = now.format("%Y-%m-%d %H:%M").to_string();
                if last_printed_minute.as_deref() != Some(minute_key.as_str()) {
                    match enqueue_clock_print(&state, false).await {
                        Ok(time_str) => {
                            tracing::info!(time = %time_str, "Clock print enqueued");
                            last_printed_minute = Some(minute_key);
                        }
                        Err(e) => {
                            tracing::warn!("Failed to enqueue clock print: {e}");
                        }
                    }
                }
            }
        }

        sleep(Duration::from_secs(CLOCK_LOOP_INTERVAL_SECS)).await;
    }
}

/// Generate a clock image and enqueue it to the print queue.
///
/// Returns the printed time string (`HH:MM`) on success.
pub async fn enqueue_clock_print(state: &SharedState, force_print: bool) -> Result<String, String> {
    enqueue_clock_print_with_options(state, true, false, force_print).await
}

/// Generate a clock image with options and enqueue it to the print queue.
pub async fn enqueue_clock_print_with_options(
    state: &SharedState,
    with_stats: bool,
    empty_leaderboard: bool,
    force_print: bool,
) -> Result<String, String> {
    let timezone = {
        let config = state.config().await;
        config.timezone.clone()
    };
    let now = now_in_timezone(&timezone);
    let time_str = now.format("%H:%M").to_string();

    let (color_image, mono_source) =
        generate_clock_images(state, &time_str, with_stats, empty_leaderboard).await?;
    let color_png = image_to_png_bytes(&color_image)?;
    let mono_png = image_to_png_bytes(&mono_source)?;

    let fax = clock_fax::save_clock_fax(state, &time_str, &color_png, &mono_png).await?;
    clock_fax::broadcast_clock_fax(state, &fax);

    let (mono_image, mono_width) = image_to_mono_bitmap(mono_source)?;
    print_queue::enqueue(PrintJob {
        mono_image,
        mono_width,
        color_image: Some(color_png),
        description: format!("Clock print {time_str}"),
        force: force_print,
    })
    .await?;

    Ok(time_str)
}

async fn generate_clock_images(
    state: &SharedState,
    time_str: &str,
    with_stats: bool,
    empty_leaderboard: bool,
) -> Result<(DynamicImage, DynamicImage), String> {
    if !with_stats {
        let simple = generate_clock_simple_image(state, time_str)?;
        return Ok((simple.clone(), DynamicImage::ImageLuma8(simple.to_luma8())));
    }

    let leaders = if empty_leaderboard {
        Vec::new()
    } else {
        match clock_bits::load_month_bits_leaders(state, MAX_BITS_LEADERS).await {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("Failed to load bits leaderboard for clock print: {e}");
                Vec::new()
            }
        }
    };

    let mono = generate_clock_stats_image(state, time_str, &leaders)?;
    let color = generate_clock_stats_color_image(state, time_str, &leaders)?;
    Ok((color, mono))
}

fn generate_clock_simple_image(
    state: &SharedState,
    time_str: &str,
) -> Result<DynamicImage, String> {
    let font_data = load_clock_font_data(state)?;
    let font = FontRef::try_from_slice(&font_data)
        .map_err(|_| "failed to parse clock font data (TTF/OTF)".to_string())?;
    Ok(image_processor::clock::generate_time_image_simple(
        time_str, &font,
    ))
}

fn generate_clock_stats_image(
    state: &SharedState,
    time_str: &str,
    leaders: &[BitsLeaderEntry],
) -> Result<DynamicImage, String> {
    let font_data = load_clock_font_data(state)?;
    let font = FontRef::try_from_slice(&font_data)
        .map_err(|_| "failed to parse clock font data (TTF/OTF)".to_string())?;
    Ok(image_processor::clock::generate_time_image_with_stats(
        time_str, leaders, &font,
    ))
}

fn generate_clock_stats_color_image(
    state: &SharedState,
    time_str: &str,
    leaders: &[BitsLeaderEntry],
) -> Result<DynamicImage, String> {
    let font_data = load_clock_font_data(state)?;
    let font = FontRef::try_from_slice(&font_data)
        .map_err(|_| "failed to parse clock font data (TTF/OTF)".to_string())?;
    Ok(image_processor::clock::generate_time_image_with_stats_color(time_str, leaders, &font))
}

fn now_in_timezone(name: &str) -> chrono::DateTime<Tz> {
    let tz = parse_timezone(name);
    chrono::Utc::now().with_timezone(&tz)
}

fn parse_timezone(name: &str) -> Tz {
    name.parse::<Tz>().unwrap_or(chrono_tz::Asia::Tokyo)
}

fn load_clock_font_data(state: &SharedState) -> Result<Vec<u8>, String> {
    let font_service = FontService::new(state.data_dir().clone());
    if let Ok(data) = font_service.get_font_data() {
        return Ok(data);
    }
    load_system_font_data()
}

fn load_system_font_data() -> Result<Vec<u8>, String> {
    for path in system_font_candidates() {
        if let Ok(data) = std::fs::read(path) {
            tracing::info!(path = %path, "Using system font for clock printing");
            return Ok(data);
        }
    }
    Err("no usable clock font found (upload custom font or install system fonts)".to_string())
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
        .map_err(|e| format!("failed to encode clock image: {e}"))?;
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

#[cfg(test)]
mod tests {
    use image::{DynamicImage, ImageBuffer, Luma};

    use super::{image_to_mono_bitmap, parse_timezone};

    #[test]
    fn parse_timezone_falls_back_to_tokyo() {
        let tz = parse_timezone("invalid/timezone");
        assert_eq!(tz.name(), "Asia/Tokyo");
    }

    #[test]
    fn image_to_mono_bitmap_thresholds_pixels() {
        let img = ImageBuffer::from_fn(
            2,
            1,
            |x, _| {
                if x == 0 { Luma([0u8]) } else { Luma([255u8]) }
            },
        );
        let (mono, width) = image_to_mono_bitmap(DynamicImage::ImageLuma8(img)).unwrap();
        assert_eq!(width, 2);
        assert_eq!(mono, vec![1, 0]);
    }
}
