//! Custom font management service.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const MAX_FONT_SIZE: u64 = 50 * 1024 * 1024; // 50MB
const VALID_EXTENSIONS: &[&str] = &[".ttf", ".otf"];

#[derive(Debug, thiserror::Error)]
pub enum FontError {
    #[error("Invalid font format (only TTF/OTF supported)")]
    InvalidFormat,
    #[error("Font file too large (max 50MB)")]
    FileTooLarge,
    #[error("No custom font configured")]
    NoCustomFont,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontInfo {
    pub has_custom_font: bool,
    pub filename: Option<String>,
    pub file_size: Option<u64>,
    pub updated_at: Option<String>,
}

#[derive(Clone)]
pub struct FontService {
    data_dir: PathBuf,
}

impl FontService {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    fn fonts_dir(&self) -> PathBuf {
        self.data_dir.join("fonts")
    }

    /// Find the currently installed custom font file, if any.
    fn find_current_font(&self) -> Option<PathBuf> {
        let dir = self.fonts_dir();
        let entries = std::fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = format!(".{}", ext.to_lowercase());
                    if VALID_EXTENSIONS.contains(&ext_lower.as_str()) {
                        return Some(path);
                    }
                }
            }
        }
        None
    }

    /// Save a custom font, replacing any existing one.
    pub fn save_custom_font(&self, filename: &str, data: &[u8]) -> Result<FontInfo, FontError> {
        if data.len() as u64 > MAX_FONT_SIZE {
            return Err(FontError::FileTooLarge);
        }

        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .unwrap_or_default();

        if !VALID_EXTENSIONS.contains(&ext.as_str()) {
            return Err(FontError::InvalidFormat);
        }

        std::fs::create_dir_all(self.fonts_dir())?;

        // Delete existing custom font
        if let Some(existing) = self.find_current_font() {
            let _ = std::fs::remove_file(existing);
        }

        let font_path = self.fonts_dir().join(filename);
        std::fs::write(&font_path, data)?;
        tracing::info!(filename = filename, "Custom font saved");
        self.get_font_info()
    }

    pub fn delete_custom_font(&self) -> Result<(), FontError> {
        let path = self.find_current_font().ok_or(FontError::NoCustomFont)?;
        std::fs::remove_file(path)?;
        tracing::info!("Custom font deleted");
        Ok(())
    }

    pub fn get_font_data(&self) -> Result<Vec<u8>, FontError> {
        let path = self.find_current_font().ok_or(FontError::NoCustomFont)?;
        Ok(std::fs::read(path)?)
    }

    pub fn get_font_info(&self) -> Result<FontInfo, FontError> {
        match self.find_current_font() {
            Some(path) => {
                let meta = std::fs::metadata(&path)?;
                let filename = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string());
                let updated_at = meta.modified().ok().map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.format("%Y-%m-%d %H:%M:%S").to_string()
                });
                Ok(FontInfo {
                    has_custom_font: true,
                    filename,
                    file_size: Some(meta.len()),
                    updated_at,
                })
            }
            None => Ok(FontInfo {
                has_custom_font: false,
                filename: None,
                file_size: None,
                updated_at: None,
            }),
        }
    }
}
