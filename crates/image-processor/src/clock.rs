//! Time/clock image generation for periodic printing.

use ab_glyph::{FontRef, PxScale};
use image::{DynamicImage, Rgba};

use crate::PAPER_WIDTH;
use crate::text::{self, DEFAULT_FONT_SIZE, UNDERLINE_HEIGHT, UNDERLINE_MARGIN};

/// Bits leaderboard entry for the monthly stats image.
#[derive(Debug, Clone)]
pub struct BitsLeaderEntry {
    pub rank: u32,
    pub user_name: String,
    pub score: u64,
    pub avatar: Option<DynamicImage>,
}

/// Generate a simple time-only image.
pub fn generate_time_image_simple(time_str: &str, font: &FontRef<'_>) -> DynamicImage {
    let scale = PxScale::from(DEFAULT_FONT_SIZE * 1.5);
    let lh = text::line_height(font, scale);
    let height = lh + UNDERLINE_MARGIN * 2 + UNDERLINE_HEIGHT;

    let mut img = text::blank_image(height);
    text::draw_centered_text(
        &mut img,
        font,
        scale,
        (UNDERLINE_MARGIN) as i32,
        time_str,
        Rgba([0, 0, 0, 255]),
    );
    text::draw_dashed_line(
        &mut img,
        height - UNDERLINE_HEIGHT - UNDERLINE_MARGIN,
        UNDERLINE_HEIGHT,
        8,
        4,
    );

    DynamicImage::ImageRgba8(img)
}

/// Generate a time image with monthly Bits leaderboard (monochrome).
pub fn generate_time_image_with_stats(
    time_str: &str,
    leaders: &[BitsLeaderEntry],
    font: &FontRef<'_>,
) -> DynamicImage {
    let title_scale = PxScale::from(DEFAULT_FONT_SIZE * 1.5);
    let body_scale = PxScale::from(DEFAULT_FONT_SIZE);
    let title_lh = text::line_height(font, title_scale);
    let body_lh = text::line_height(font, body_scale);
    let padding = 8u32;

    let leader_height = if leaders.is_empty() {
        0
    } else {
        padding + (leaders.len() as u32) * (body_lh + 4) + padding
    };

    let height = padding
        + title_lh
        + padding
        + UNDERLINE_HEIGHT
        + leader_height
        + UNDERLINE_HEIGHT
        + padding;

    let mut img = text::blank_image(height);

    // Time text
    text::draw_centered_text(
        &mut img,
        font,
        title_scale,
        padding as i32,
        time_str,
        Rgba([0, 0, 0, 255]),
    );

    let mut y = padding + title_lh + padding;
    text::draw_dashed_line(&mut img, y, UNDERLINE_HEIGHT, 8, 4);
    y += UNDERLINE_HEIGHT + padding;

    // Leaderboard entries
    for entry in leaders {
        let text = format!("#{} {} — {} bits", entry.rank, entry.user_name, entry.score);
        imageproc::drawing::draw_text_mut(
            &mut img,
            Rgba([0, 0, 0, 255]),
            padding as i32,
            y as i32,
            body_scale,
            font,
            &text,
        );
        y += body_lh + 4;
    }

    if !leaders.is_empty() {
        text::draw_dashed_line(&mut img, y + padding, UNDERLINE_HEIGHT, 8, 4);
    }

    DynamicImage::ImageLuma8(image::imageops::grayscale(&img))
}

/// Generate a font preview image.
pub fn generate_preview_image(sample_text: &str, font: &FontRef<'_>) -> DynamicImage {
    let scale = PxScale::from(DEFAULT_FONT_SIZE);
    let lh = text::line_height(font, scale);
    let lines = text::wrap_text(font, scale, sample_text, PAPER_WIDTH - 16);
    let height = (lines.len() as u32) * (lh + 2) + 16;

    let mut img = text::blank_image(height);
    let mut y = 8i32;
    for line in &lines {
        imageproc::drawing::draw_text_mut(&mut img, Rgba([0, 0, 0, 255]), 8, y, scale, font, line);
        y += lh as i32 + 2;
    }

    DynamicImage::ImageRgba8(img)
}
