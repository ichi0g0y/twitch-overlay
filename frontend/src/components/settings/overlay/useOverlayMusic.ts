import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

import { buildApiUrl } from '../../../utils/api';

interface UseOverlayMusicParams {
  musicStatus: {
    current_track: { id?: string; has_artwork?: boolean } | null;
  };
  overlayMusicVolume?: number;
  setMusicStatus?: (value: any) => void;
  setPlaylists?: (value: any[]) => void;
}

export const useOverlayMusic = ({
  musicStatus,
  overlayMusicVolume,
  setMusicStatus,
  setPlaylists,
}: UseOverlayMusicParams) => {
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/music/playlists'));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setPlaylists?.(data.playlists || []);
      } catch (error) {
        console.error('Failed to fetch playlists:', error);
      }
    };

    fetchPlaylists();
  }, [setPlaylists]);

  useEffect(() => {
    const fetchMusicStatus = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/music/state'));
        if (response.ok) {
          const state = await response.json();
          const status = {
            playback_status: state.playback_status ?? 'stopped',
            is_playing: state.is_playing ?? false,
            current_track: null,
            current_time: state.position ?? 0,
            duration: state.duration ?? 0,
            volume: state.volume !== undefined ? state.volume : (overlayMusicVolume ?? 100),
            playlist_name: state.playlist_name ?? undefined,
          };
          setMusicStatus?.(status);
        }
      } catch (error) {
        console.error('Failed to fetch music status:', error);
      }
    };

    fetchMusicStatus();

    let unsubscribe: (() => void) | null = null;
    const tauriUnlisteners: Promise<UnlistenFn>[] = [];

    const setupWebSocket = async () => {
      try {
        const { getWebSocketClient } = await import('../../../utils/websocket');
        const wsClient = getWebSocketClient();

        await wsClient.connect();

        unsubscribe = wsClient.on('music_status', (status: any) => {
          const mergedStatus = {
            ...status,
            volume: status.volume !== undefined ? status.volume : (overlayMusicVolume ?? 100),
          };
          setMusicStatus?.(mergedStatus);
        });

        const isTauriRuntime = typeof window !== 'undefined'
          && (
            typeof (window as any).__TAURI__ !== 'undefined'
            || typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
          );

        if (isTauriRuntime) {
          tauriUnlisteners.push(listen<any>('music_status_update', (event) => {
            const payload = event.payload ?? {};
            const mergedStatus = {
              ...payload,
              volume: payload.volume !== undefined ? payload.volume : (overlayMusicVolume ?? 100),
            };
            setMusicStatus?.(mergedStatus);
          }));
        }
      } catch (error) {
        console.error('Failed to setup WebSocket:', error);
      }
    };

    setupWebSocket();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      tauriUnlisteners.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(() => undefined);
      });
    };
  }, [overlayMusicVolume, setMusicStatus]);

  useEffect(() => {
    const updateArtworkUrl = async () => {
      if (musicStatus.current_track?.has_artwork && musicStatus.current_track?.id) {
        try {
          setArtworkUrl(buildApiUrl(`/api/music/track/${musicStatus.current_track.id}/artwork`));
        } catch (error) {
          console.error('Failed to build artwork URL:', error);
          setArtworkUrl(null);
        }
      } else {
        setArtworkUrl(null);
      }
    };

    updateArtworkUrl();
  }, [musicStatus.current_track]);

  return {
    artworkUrl,
    setArtworkUrl,
  };
};
