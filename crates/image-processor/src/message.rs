//! Chat message to image conversion.
//!
//! Converts chat message fragments (text + emotes) into a thermal
//! printer-compatible image with word wrapping and emote embedding.

use ab_glyph::{FontRef, PxScale};
use image::{DynamicImage, Rgba};
use imageproc::drawing::draw_text_mut;

use crate::PAPER_WIDTH;
use crate::compose;
use crate::text::{self, DEFAULT_FONT_SIZE, Fragment, UNDERLINE_HEIGHT, UNDERLINE_MARGIN};

const BLACK: Rgba<u8> = Rgba([0, 0, 0, 255]);

/// Layout result for wrapped fragments.
struct WrappedLine {
    fragments: Vec<Fragment>,
    is_emote_only: bool,
}

/// Convert chat message fragments into a printer-ready image.
///
/// - `username`: displayed above the message
/// - `fragments`: text and emote fragments
/// - `font`: the font to render text with
/// - `use_color`: if false, converts output to grayscale
pub fn message_to_image(
    username: &str,
    fragments: &[Fragment],
    font: &FontRef<'_>,
    use_color: bool,
) -> DynamicImage {
    let scale = PxScale::from(DEFAULT_FONT_SIZE);
    let lh = text::line_height(font, scale);
    let max_width = PAPER_WIDTH;

    // Wrap fragments into lines
    let lines = wrap_fragments(fragments, font, scale, max_width, lh);

    // Calculate total image height
    let header_height = lh + 4; // username line + small padding
    let mut content_height = 0u32;
    for line in &lines {
        if line.is_emote_only {
            content_height += lh + 4; // emote cells
        } else {
            content_height += lh + 2;
        }
    }
    let footer_height = UNDERLINE_MARGIN * 2 + UNDERLINE_HEIGHT;
    let total_height = header_height + content_height + footer_height;

    let mut img = text::blank_image(total_height);

    // Draw username
    draw_text_mut(&mut img, BLACK, 0, 0, scale, font, username);
    let mut y = header_height as i32;

    // Draw each line
    for line in &lines {
        let mut x = 0i32;
        for frag in &line.fragments {
            if frag.is_emote {
                if let Some(ref emote_img) = frag.emote_image {
                    let resized =
                        emote_img.resize_exact(lh, lh, image::imageops::FilterType::Lanczos3);
                    compose::overlay(&mut img, &resized, x as u32, y as u32);
                    x += lh as i32;
                } else {
                    // Fallback: draw emote name as text
                    draw_text_mut(&mut img, BLACK, x, y, scale, font, &frag.text);
                    x += text::measure_text_width(font, scale, &frag.text) as i32;
                }
            } else {
                draw_text_mut(&mut img, BLACK, x, y, scale, font, &frag.text);
                x += text::measure_text_width(font, scale, &frag.text) as i32;
            }
        }
        y += if line.is_emote_only {
            lh as i32 + 4
        } else {
            lh as i32 + 2
        };
    }

    // Draw underline separator
    let underline_y = (total_height - footer_height + UNDERLINE_MARGIN) as u32;
    text::draw_dashed_line(&mut img, underline_y, UNDERLINE_HEIGHT, 8, 4);

    if use_color {
        DynamicImage::ImageRgba8(img)
    } else {
        DynamicImage::ImageLuma8(image::imageops::grayscale(&img))
    }
}

/// Convert a message with a title header into an image.
///
/// Layout:
/// ```text
/// [Avatar] Title
///          Username / Extra
/// ─────────────────────────
/// Details text (wrapped)
/// ─────────────────────────
/// Date/Time footer
/// ```
pub fn message_to_image_with_title(
    title: &str,
    username: &str,
    details: &str,
    avatar: Option<&DynamicImage>,
    font: &FontRef<'_>,
    use_color: bool,
) -> DynamicImage {
    let scale = PxScale::from(DEFAULT_FONT_SIZE);
    let small_scale = PxScale::from(DEFAULT_FONT_SIZE * 0.75);
    let lh = text::line_height(font, scale);
    let avatar_size = 48u32;
    let padding = 8u32;

    // Header section
    let header_height = avatar_size.max(lh * 2) + padding;

    // Details section
    let detail_lines = text::wrap_text(font, scale, details, PAPER_WIDTH - padding);
    let details_height = (detail_lines.len() as u32) * (lh + 2) + padding * 2;

    // Footer
    let footer_height = lh + UNDERLINE_MARGIN * 2 + UNDERLINE_HEIGHT;

    let total_height = header_height + UNDERLINE_HEIGHT + details_height + footer_height;
    let mut img = text::blank_image(total_height);

    // Draw avatar
    let text_x = if let Some(av) = avatar {
        let resized = av.resize_exact(
            avatar_size,
            avatar_size,
            image::imageops::FilterType::Lanczos3,
        );
        compose::overlay(&mut img, &resized, 0, 0);
        avatar_size + padding
    } else {
        0
    };

    // Draw title and username
    draw_text_mut(&mut img, BLACK, text_x as i32, 0, scale, font, title);
    draw_text_mut(
        &mut img,
        Rgba([100, 100, 100, 255]),
        text_x as i32,
        lh as i32 + 2,
        small_scale,
        font,
        username,
    );

    // Separator after header
    text::draw_dashed_line(&mut img, header_height, UNDERLINE_HEIGHT, 8, 4);

    // Draw details
    let mut y = (header_height + UNDERLINE_HEIGHT + padding) as i32;
    for line in &detail_lines {
        draw_text_mut(&mut img, BLACK, padding as i32, y, scale, font, line);
        y += lh as i32 + 2;
    }

    // Footer separator + timestamp
    let sep_y = header_height + UNDERLINE_HEIGHT + details_height;
    text::draw_dashed_line(&mut img, sep_y, UNDERLINE_HEIGHT, 8, 4);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    text::draw_centered_text(
        &mut img,
        font,
        small_scale,
        (sep_y + UNDERLINE_HEIGHT + UNDERLINE_MARGIN) as i32,
        &now,
        Rgba([128, 128, 128, 255]),
    );

    if use_color {
        DynamicImage::ImageRgba8(img)
    } else {
        DynamicImage::ImageLuma8(image::imageops::grayscale(&img))
    }
}

/// Wrap fragments into lines that fit within max_width.
fn wrap_fragments(
    fragments: &[Fragment],
    font: &FontRef<'_>,
    scale: PxScale,
    max_width: u32,
    line_height: u32,
) -> Vec<WrappedLine> {
    let mut lines: Vec<WrappedLine> = Vec::new();
    let mut current_frags: Vec<Fragment> = Vec::new();
    let mut current_width = 0u32;
    let mut all_emotes = true;

    for frag in fragments {
        if frag.is_emote {
            let emote_width = line_height;
            if current_width + emote_width > max_width && !current_frags.is_empty() {
                lines.push(WrappedLine {
                    fragments: std::mem::take(&mut current_frags),
                    is_emote_only: all_emotes,
                });
                current_width = 0;
                all_emotes = true;
            }
            current_frags.push(frag.clone());
            current_width += emote_width;
        } else {
            all_emotes = false;
            // Split text by words
            for word in frag.text.split_inclusive(|c: char| c.is_whitespace()) {
                let w = text::measure_text_width(font, scale, word);
                if current_width + w > max_width && !current_frags.is_empty() {
                    lines.push(WrappedLine {
                        fragments: std::mem::take(&mut current_frags),
                        is_emote_only: false,
                    });
                    current_width = 0;
                }
                current_frags.push(Fragment {
                    text: word.to_string(),
                    is_emote: false,
                    emote_image: None,
                });
                current_width += w;
                all_emotes = false;
            }
        }
    }

    if !current_frags.is_empty() {
        lines.push(WrappedLine {
            fragments: current_frags,
            is_emote_only: all_emotes,
        });
    }

    if lines.is_empty() {
        lines.push(WrappedLine {
            fragments: vec![],
            is_emote_only: false,
        });
    }

    lines
}
