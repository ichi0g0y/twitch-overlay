//! Music tracks, playlists, and playback state.

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub added_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistTrack {
    pub playlist_id: String,
    pub track_id: String,
    pub position: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub track_id: String,
    pub position: f64,
    pub duration: f64,
    pub playback_status: String,
    pub is_playing: bool,
    pub volume: i32,
    pub playlist_name: Option<String>,
}

impl Database {
    // --- Tracks ---

    pub fn add_track(&self, track: &Track) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR IGNORE INTO tracks (id, file_path, title, artist, album, duration) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![track.id, track.file_path, track.title, track.artist, track.album, track.duration],
            )?;
            Ok(())
        })
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, file_path, title, artist, album, duration, added_at FROM tracks ORDER BY added_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Track {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    duration: row.get(5)?,
                    added_at: row.get(6)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn delete_track(&self, track_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM tracks WHERE id = ?1", [track_id])?;
            Ok(())
        })
    }

    // --- Playlists ---

    pub fn create_playlist(&self, id: &str, name: &str, description: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO playlists (id, name, description) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, name, description],
            )?;
            Ok(())
        })
    }

    pub fn get_all_playlists(&self) -> Result<Vec<Playlist>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, description, created_at FROM playlists ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn delete_playlist(&self, playlist_id: &str) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM playlists WHERE id = ?1", [playlist_id])?;
            Ok(())
        })
    }

    // --- Playlist Tracks ---

    pub fn add_track_to_playlist(
        &self,
        playlist_id: &str,
        track_id: &str,
        position: i32,
    ) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                rusqlite::params![playlist_id, track_id, position],
            )?;
            Ok(())
        })
    }

    pub fn remove_track_from_playlist(
        &self,
        playlist_id: &str,
        track_id: &str,
    ) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
                rusqlite::params![playlist_id, track_id],
            )?;
            Ok(())
        })
    }

    pub fn get_playlist_tracks(&self, playlist_id: &str) -> Result<Vec<PlaylistTrack>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT playlist_id, track_id, position FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position",
            )?;
            let rows = stmt.query_map([playlist_id], |row| {
                Ok(PlaylistTrack {
                    playlist_id: row.get(0)?,
                    track_id: row.get(1)?,
                    position: row.get(2)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    // --- Playback State ---

    pub fn get_playback_state(&self) -> Result<Option<PlaybackState>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT track_id, position, duration, playback_status, is_playing, volume, playlist_name
                 FROM playback_state ORDER BY id DESC LIMIT 1",
            )?;
            let state = stmt
                .query_row([], |row| {
                    Ok(PlaybackState {
                        track_id: row.get(0)?,
                        position: row.get(1)?,
                        duration: row.get(2)?,
                        playback_status: row.get(3)?,
                        is_playing: row.get(4)?,
                        volume: row.get(5)?,
                        playlist_name: row.get(6)?,
                    })
                })
                .optional()?;
            Ok(state)
        })
    }

    pub fn save_playback_state(&self, state: &PlaybackState) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO playback_state (id, track_id, position, duration, playback_status, is_playing, volume, playlist_name, updated_at)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                    track_id = ?1, position = ?2, duration = ?3, playback_status = ?4,
                    is_playing = ?5, volume = ?6, playlist_name = ?7, updated_at = CURRENT_TIMESTAMP",
                rusqlite::params![
                    state.track_id, state.position, state.duration, state.playback_status,
                    state.is_playing, state.volume, state.playlist_name,
                ],
            )?;
            Ok(())
        })
    }
}

trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
