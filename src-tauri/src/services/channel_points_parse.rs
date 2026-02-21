//! Parsing helpers for channel points message rendering.

use std::collections::HashMap;

use image::DynamicImage;
use image_engine::text::Fragment;
use reqwest::Client;

#[derive(Debug)]
pub enum ParsedPart {
    Text(String),
    Emote { name: String, url: String },
}

pub fn parse_with_emotes(
    user_input: &str,
    emote_name_map: &HashMap<String, String>,
) -> Vec<ParsedPart> {
    if user_input.is_empty() {
        return Vec::new();
    }

    let mut by_first_char: HashMap<char, Vec<(&str, &str)>> = HashMap::new();
    for (name, url) in emote_name_map {
        if let Some(first) = name.chars().next() {
            by_first_char
                .entry(first)
                .or_default()
                .push((name.as_str(), url.as_str()));
        }
    }
    for entries in by_first_char.values_mut() {
        entries.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    }

    let mut parts = Vec::new();
    let mut text_buf = String::new();
    let mut i = 0usize;

    while i < user_input.len() {
        let rest = match user_input.get(i..) {
            Some(s) => s,
            None => break,
        };
        let ch = match rest.chars().next() {
            Some(c) => c,
            None => break,
        };

        let prev = user_input[..i].chars().next_back();
        let mut matched: Option<(&str, &str)> = None;
        if is_word_boundary(prev) {
            if let Some(candidates) = by_first_char.get(&ch) {
                for (name, url) in candidates {
                    if rest.starts_with(name) {
                        let end = i + name.len();
                        let next = user_input.get(end..).and_then(|s| s.chars().next());
                        if is_word_boundary(next) {
                            matched = Some((*name, *url));
                            break;
                        }
                    }
                }
            }
        }

        if let Some((name, url)) = matched {
            if !text_buf.is_empty() {
                parts.push(ParsedPart::Text(std::mem::take(&mut text_buf)));
            }
            parts.push(ParsedPart::Emote {
                name: name.to_string(),
                url: url.to_string(),
            });
            i += name.len();
        } else {
            text_buf.push(ch);
            i += ch.len_utf8();
        }
    }

    if !text_buf.is_empty() {
        parts.push(ParsedPart::Text(text_buf));
    }

    parts
}

pub async fn fetch_emote_image(client: &Client, url: &str) -> Option<DynamicImage> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    image::load_from_memory(&bytes).ok()
}

pub fn text_fragment(text: &str) -> Fragment {
    Fragment {
        text: text.to_string(),
        is_emote: false,
        emote_image: None,
    }
}

fn is_word_boundary(ch: Option<char>) -> bool {
    match ch {
        None => true,
        Some(c) => !c.is_alphanumeric() && c != '_',
    }
}
