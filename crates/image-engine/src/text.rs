//! Text rendering utilities for thermal printer images.
//!
//! Provides centered text drawing, word-wrapping, and fragment-based
//! text layout for chat messages containing text and emotes.

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use image::{DynamicImage, Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;

use crate::PAPER_WIDTH;

/// Default font size in pixels.
pub const DEFAULT_FONT_SIZE: f32 = 32.0;

/// Height of the underline separator.
pub const UNDERLINE_HEIGHT: u32 = 4;

/// Margin above/below the underline.
pub const UNDERLINE_MARGIN: u32 = 10;

/// A fragment of a chat message (text or emote placeholder).
#[derive(Debug, Clone)]
pub struct Fragment {
    pub text: String,
    pub is_emote: bool,
    pub emote_image: Option<DynamicImage>,
}

/// Measure the pixel width of a string at the given font and scale.
pub fn measure_text_width(font: &FontRef<'_>, scale: PxScale, text: &str) -> u32 {
    let scaled = font.as_scaled(scale);
    let mut width = 0.0f32;
    let mut prev_glyph: Option<ab_glyph::GlyphId> = None;

    for ch in text.chars() {
        let glyph_id = scaled.glyph_id(ch);
        if let Some(prev) = prev_glyph {
            width += scaled.kern(prev, glyph_id);
        }
        width += scaled.h_advance(glyph_id);
        prev_glyph = Some(glyph_id);
    }

    width.ceil() as u32
}

/// Compute the line height for the given font and scale.
pub fn line_height(font: &FontRef<'_>, scale: PxScale) -> u32 {
    let scaled = font.as_scaled(scale);
    (scaled.ascent() - scaled.descent() + scaled.line_gap()).ceil() as u32
}

/// Draw centered text on an existing RGBA image.
pub fn draw_centered_text(
    img: &mut RgbaImage,
    font: &FontRef<'_>,
    scale: PxScale,
    y: i32,
    text: &str,
    color: Rgba<u8>,
) {
    let text_width = measure_text_width(font, scale, text) as i32;
    let x = ((img.width() as i32) - text_width).max(0) / 2;
    draw_text_mut(img, color, x, y, scale, font, text);
}

/// Wrap text to fit within `max_width` pixels.
///
/// Returns a list of lines, each fitting within the width constraint.
pub fn wrap_text(font: &FontRef<'_>, scale: PxScale, text: &str, max_width: u32) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current_line = String::new();
    let mut current_width: u32 = 0;

    for word in text.split_inclusive(|c: char| c.is_whitespace()) {
        let word_width = measure_text_width(font, scale, word);

        if current_width + word_width > max_width && !current_line.is_empty() {
            lines.push(current_line.trim_end().to_string());
            current_line = String::new();
            current_width = 0;
        }

        // If a single word exceeds max_width, force-break it character by character
        if word_width > max_width && current_line.is_empty() {
            let mut char_line = String::new();
            let mut char_width: u32 = 0;
            for ch in word.chars() {
                let ch_w = measure_text_width(font, scale, &ch.to_string());
                if char_width + ch_w > max_width && !char_line.is_empty() {
                    lines.push(char_line);
                    char_line = String::new();
                    char_width = 0;
                }
                char_line.push(ch);
                char_width += ch_w;
            }
            if !char_line.is_empty() {
                current_line = char_line;
                current_width = char_width;
            }
            continue;
        }

        current_line.push_str(word);
        current_width += word_width;
    }

    if !current_line.is_empty() {
        lines.push(current_line.trim_end().to_string());
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}

/// Draw a horizontal dashed line across the image.
pub fn draw_dashed_line(img: &mut RgbaImage, y: u32, thickness: u32, dash_len: u32, gap_len: u32) {
    let width = img.width();
    let color = Rgba([0u8, 0, 0, 255]);
    let mut x = 0u32;
    let mut drawing = true;

    while x < width {
        let segment = if drawing { dash_len } else { gap_len };
        if drawing {
            for dx in 0..segment.min(width - x) {
                for dy in 0..thickness {
                    if y + dy < img.height() {
                        img.put_pixel(x + dx, y + dy, color);
                    }
                }
            }
        }
        x += segment;
        drawing = !drawing;
    }
}

/// Create a blank white RGBA image with the standard paper width.
pub fn blank_image(height: u32) -> RgbaImage {
    RgbaImage::from_pixel(PAPER_WIDTH, height, Rgba([255, 255, 255, 255]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_image_has_correct_dimensions() {
        let img = blank_image(100);
        assert_eq!(img.width(), PAPER_WIDTH);
        assert_eq!(img.height(), 100);
    }

    #[test]
    fn dashed_line_draws_within_bounds() {
        let mut img = blank_image(50);
        draw_dashed_line(&mut img, 25, 4, 8, 4);
        // Verify some pixels were drawn
        let px = img.get_pixel(0, 25);
        assert_eq!(px, &Rgba([0, 0, 0, 255]));
    }
}
