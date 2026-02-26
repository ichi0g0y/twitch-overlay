import type { Playlist, Track } from '@shared/types/music';
import { buildApiUrl } from '../../../utils/api';

export const fetchTracks = async (): Promise<Track[]> => {
  const response = await fetch(buildApiUrl('/api/music/tracks'));
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.tracks || [];
};

export const fetchPlaylists = async (): Promise<Playlist[]> => {
  const response = await fetch(buildApiUrl('/api/music/playlists'));
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.playlists || [];
};

export const fetchPlaylistTracks = async (playlistId: string): Promise<Track[]> => {
  const response = await fetch(buildApiUrl(`/api/music/playlist/${playlistId}/tracks`));
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.tracks || [];
};

export const deleteTrackById = async (trackId: string) => {
  return fetch(buildApiUrl(`/api/music/track/${trackId}`), {
    method: 'DELETE',
  });
};

export const deleteAllTracks = async () => {
  return fetch(buildApiUrl('/api/music/track/all'), {
    method: 'DELETE',
  });
};

export const addTrackToPlaylist = async (trackId: string, playlistId: string) => {
  return fetch(buildApiUrl(`/api/music/playlist/${playlistId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add_track',
      track_id: trackId,
      position: 0,
    }),
  });
};

export const createPlaylist = async (name: string): Promise<Playlist | null> => {
  const response = await fetch(buildApiUrl('/api/music/playlist'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: '',
      track_ids: [],
    }),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
};
