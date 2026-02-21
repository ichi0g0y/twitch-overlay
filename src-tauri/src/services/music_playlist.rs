//! Playlist management service.

use overlay_db::Database;
use overlay_db::music::{Playlist, PlaylistTrack, Track};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum PlaylistError {
    #[allow(dead_code)]
    #[error("Playlist not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Db(#[from] overlay_db::DbError),
}

#[derive(Clone)]
pub struct PlaylistService {
    db: Database,
}

impl PlaylistService {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    fn generate_id(name: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(name.as_bytes());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        hasher.update(now.as_nanos().to_le_bytes());
        hex::encode(&hasher.finalize()[..8])
    }

    pub fn create_playlist(
        &self,
        name: &str,
        description: &str,
    ) -> Result<Playlist, PlaylistError> {
        let id = Self::generate_id(name);
        self.db.create_playlist(&id, name, description)?;
        tracing::info!(id = %id, name = name, "Playlist created");
        Ok(Playlist {
            id,
            name: name.to_string(),
            description: Some(description.to_string()),
            created_at: None,
        })
    }

    pub fn get_playlist(&self, playlist_id: &str) -> Result<Option<Playlist>, PlaylistError> {
        let playlists = self.db.get_all_playlists()?;
        Ok(playlists.into_iter().find(|p| p.id == playlist_id))
    }

    pub fn get_all_playlists(&self) -> Result<Vec<Playlist>, PlaylistError> {
        Ok(self.db.get_all_playlists()?)
    }

    pub fn delete_playlist(&self, playlist_id: &str) -> Result<(), PlaylistError> {
        self.db.delete_playlist(playlist_id)?;
        tracing::info!(id = playlist_id, "Playlist deleted");
        Ok(())
    }

    /// Add a track to a playlist. If position <= 0, append to end.
    pub fn add_track(
        &self,
        playlist_id: &str,
        track_id: &str,
        position: i32,
    ) -> Result<(), PlaylistError> {
        let pos = if position <= 0 {
            let tracks = self.db.get_playlist_tracks(playlist_id)?;
            tracks.iter().map(|t| t.position).max().unwrap_or(0) + 1
        } else {
            position
        };
        self.db.add_track_to_playlist(playlist_id, track_id, pos)?;
        tracing::info!(
            playlist = playlist_id,
            track = track_id,
            pos = pos,
            "Track added"
        );
        Ok(())
    }

    pub fn remove_track(&self, playlist_id: &str, track_id: &str) -> Result<(), PlaylistError> {
        self.db.remove_track_from_playlist(playlist_id, track_id)?;
        tracing::info!(playlist = playlist_id, track = track_id, "Track removed");
        Ok(())
    }

    pub fn get_tracks(&self, playlist_id: &str) -> Result<Vec<PlaylistTrack>, PlaylistError> {
        Ok(self.db.get_playlist_tracks(playlist_id)?)
    }

    pub fn get_tracks_full(&self, playlist_id: &str) -> Result<Vec<Track>, PlaylistError> {
        Ok(self.db.get_playlist_tracks_full(playlist_id)?)
    }

    /// Reorder a track within a playlist.
    pub fn update_track_order(
        &self,
        playlist_id: &str,
        track_id: &str,
        new_position: i32,
    ) -> Result<(), PlaylistError> {
        self.db.with_conn_mut(|conn| {
            let tx = conn.transaction()?;

            let current: i32 = tx
                .query_row(
                    "SELECT position FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
                    rusqlite::params![playlist_id, track_id],
                    |row| row.get(0),
                )
                .map_err(|_| {
                    overlay_db::DbError::NotFound(format!(
                        "Track {track_id} not in playlist {playlist_id}"
                    ))
                })?;

            if current != new_position {
                if new_position < current {
                    tx.execute(
                        "UPDATE playlist_tracks SET position = position + 1 \
                         WHERE playlist_id = ?1 AND position >= ?2 AND position < ?3",
                        rusqlite::params![playlist_id, new_position, current],
                    )?;
                } else {
                    tx.execute(
                        "UPDATE playlist_tracks SET position = position - 1 \
                         WHERE playlist_id = ?1 AND position > ?2 AND position <= ?3",
                        rusqlite::params![playlist_id, current, new_position],
                    )?;
                }
                tx.execute(
                    "UPDATE playlist_tracks SET position = ?1 \
                     WHERE playlist_id = ?2 AND track_id = ?3",
                    rusqlite::params![new_position, playlist_id, track_id],
                )?;
            }

            tx.commit()?;
            Ok(())
        })?;
        tracing::info!(
            playlist = playlist_id,
            track = track_id,
            pos = new_position,
            "Order updated"
        );
        Ok(())
    }
}
