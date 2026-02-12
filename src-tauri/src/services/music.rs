//! Music track management service.

use std::io::Cursor;
use std::path::PathBuf;

use lofty::file::TaggedFile;
use lofty::prelude::*;
use lofty::probe::Probe;
use overlay_db::music::Track;
use overlay_db::Database;
use sha2::{Digest, Sha256};

const MAX_FILE_SIZE: usize = 50 * 1024 * 1024; // 50MB
const VALID_EXTENSIONS: &[&str] = &["mp3", "wav", "m4a", "ogg"];

#[derive(Debug, thiserror::Error)]
pub enum MusicError {
    #[error("File too large (max 50MB)")]
    FileTooLarge,
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("Track not found: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Db(#[from] overlay_db::DbError),
    #[error("Metadata error: {0}")]
    Metadata(String),
}

struct TrackMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    artwork_data: Option<Vec<u8>>,
}

#[derive(Clone)]
pub struct MusicService {
    db: Database,
    data_dir: PathBuf,
}

impl MusicService {
    pub fn new(db: Database, data_dir: PathBuf) -> Self {
        Self { db, data_dir }
    }

    fn tracks_dir(&self) -> PathBuf {
        self.data_dir.join("music").join("tracks")
    }

    fn artwork_dir(&self) -> PathBuf {
        self.data_dir.join("music").join("artwork")
    }

    fn ensure_dirs(&self) -> Result<(), MusicError> {
        std::fs::create_dir_all(self.tracks_dir())?;
        std::fs::create_dir_all(self.artwork_dir())?;
        Ok(())
    }

    /// Save an uploaded music track, extract metadata, and store in DB.
    pub fn save_track(&self, filename: &str, data: &[u8]) -> Result<Track, MusicError> {
        if data.len() > MAX_FILE_SIZE {
            return Err(MusicError::FileTooLarge);
        }

        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !VALID_EXTENSIONS.contains(&ext.as_str()) {
            return Err(MusicError::UnsupportedFormat(ext));
        }

        self.ensure_dirs()?;

        // Generate SHA256-based ID
        let mut hasher = Sha256::new();
        hasher.update(data);
        let id = hex::encode(&hasher.finalize()[..16]);

        // Save track file
        let file_path = self.tracks_dir().join(format!("{id}.{ext}"));
        std::fs::write(&file_path, data)?;

        // Extract metadata
        let meta = self.extract_metadata(data, filename);

        // Save artwork if available
        if let Some(ref artwork) = meta.artwork_data {
            let artwork_path = self.artwork_dir().join(format!("{id}.jpg"));
            let _ = std::fs::write(artwork_path, artwork);
        }

        let track = Track {
            id: id.clone(),
            file_path: file_path.to_string_lossy().into_owned(),
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            duration: meta.duration,
            added_at: None,
        };

        self.db.add_track(&track)?;
        tracing::info!(id = %id, filename = filename, "Track saved");
        Ok(track)
    }

    pub fn get_track(&self, id: &str) -> Result<Track, MusicError> {
        let tracks = self.db.get_all_tracks()?;
        tracks
            .into_iter()
            .find(|t| t.id == id)
            .ok_or_else(|| MusicError::NotFound(id.to_string()))
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>, MusicError> {
        Ok(self.db.get_all_tracks()?)
    }

    pub fn delete_track(&self, id: &str) -> Result<(), MusicError> {
        let track = self.get_track(id)?;
        let _ = std::fs::remove_file(&track.file_path);
        let artwork_path = self.artwork_dir().join(format!("{id}.jpg"));
        let _ = std::fs::remove_file(artwork_path);
        self.db.delete_track(id)?;
        tracing::info!(id = id, "Track deleted");
        Ok(())
    }

    pub fn delete_all_tracks(&self) -> Result<(), MusicError> {
        let tracks = self.db.get_all_tracks()?;
        for track in &tracks {
            let _ = std::fs::remove_file(&track.file_path);
            let artwork_path = self.artwork_dir().join(format!("{}.jpg", track.id));
            let _ = std::fs::remove_file(artwork_path);
            self.db.delete_track(&track.id)?;
        }
        tracing::info!(count = tracks.len(), "All tracks deleted");
        Ok(())
    }

    pub fn get_track_path(&self, id: &str) -> Result<PathBuf, MusicError> {
        let track = self.get_track(id)?;
        Ok(PathBuf::from(&track.file_path))
    }

    pub fn get_artwork_path(&self, id: &str) -> Option<PathBuf> {
        let path = self.artwork_dir().join(format!("{id}.jpg"));
        path.exists().then_some(path)
    }

    fn extract_metadata(&self, data: &[u8], filename: &str) -> TrackMetadata {
        let cursor = Cursor::new(data.to_vec());
        match Probe::new(cursor).guess_file_type() {
            Ok(probe) => match probe.read() {
                Ok(tagged_file) => Self::parse_tagged_file(&tagged_file, filename),
                Err(_) => fallback_metadata(filename),
            },
            Err(_) => fallback_metadata(filename),
        }
    }

    fn parse_tagged_file(tagged: &TaggedFile, filename: &str) -> TrackMetadata {
        let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

        let title: Option<String> = tag.and_then(|t| t.title().map(|s| s.to_string()));
        let artist: Option<String> = tag.and_then(|t| t.artist().map(|s| s.to_string()));
        let album: Option<String> = tag.and_then(|t| t.album().map(|s| s.to_string()));

        let dur_secs = tagged.properties().duration().as_secs_f64();
        let duration = if dur_secs > 0.0 { Some(dur_secs) } else { None };

        let artwork_data: Option<Vec<u8>> = tag
            .and_then(|t| t.pictures().first().map(|pic| pic.data().to_vec()));

        let stem = || {
            std::path::Path::new(filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        };

        TrackMetadata {
            title: title.or_else(stem),
            artist: artist.or_else(|| Some("Unknown Artist".to_string())),
            album,
            duration,
            artwork_data,
        }
    }
}

fn fallback_metadata(filename: &str) -> TrackMetadata {
    let title = std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());

    TrackMetadata {
        title,
        artist: Some("Unknown Artist".to_string()),
        album: None,
        duration: None,
        artwork_data: None,
    }
}
