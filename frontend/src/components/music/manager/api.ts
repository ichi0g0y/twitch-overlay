import { buildApiUrl } from '../../../utils/api';
import type { Playlist, Track } from '@shared/types/music';

interface TrackLoadResult {
  tracks: Track[];
  artworkUrls: Record<string, string>;
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
};

export const fetchTracks = async (): Promise<TrackLoadResult> => {
  const data = await fetchJson<{ tracks?: Track[] }>(buildApiUrl('/api/music/tracks'));
  const tracks = data?.tracks || [];

  const artworkUrls: Record<string, string> = {};
  for (const track of tracks) {
    if (track.has_artwork) {
      artworkUrls[track.id] = buildApiUrl(`/api/music/track/${track.id}/artwork`);
    }
  }

  return { tracks, artworkUrls };
};

export const fetchPlaylists = async (): Promise<Playlist[]> => {
  const data = await fetchJson<{ playlists?: Playlist[] }>(buildApiUrl('/api/music/playlists'));
  return data?.playlists || [];
};

export const fetchPlaylistTracks = async (playlistId: string): Promise<Track[]> => {
  const data = await fetchJson<{ tracks?: Array<Track | null> }>(
    buildApiUrl(`/api/music/playlist/${playlistId}/tracks`),
  );
  return (data?.tracks || []).filter((track): track is Track => track !== null);
};

export const deleteTrack = async (trackId: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/music/track/${trackId}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

export const deleteAllTracks = async (): Promise<void> => {
  const response = await fetch(buildApiUrl('/api/music/track/all'), {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

export const addTrackToPlaylist = async (trackId: string, playlistId: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/music/playlist/${playlistId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add_track',
      track_id: trackId,
      position: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

export const addTracksToPlaylist = async (trackIds: string[], playlistId: string): Promise<void> => {
  for (const trackId of trackIds) {
    try {
      await addTrackToPlaylist(trackId, playlistId);
    } catch (error) {
      console.error('Failed to add track:', error);
    }
  }
};

export const createPlaylist = async (name: string): Promise<Playlist> => {
  const response = await fetch(buildApiUrl('/api/music/playlist'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: '' }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as Playlist;
};

export const createArtworkUrl = (trackId: string): string => buildApiUrl(`/api/music/track/${trackId}/artwork`);
