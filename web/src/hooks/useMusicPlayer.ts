import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicPlayerState, PlaybackStatus, Track } from '@shared/types/music';
import { buildApiUrl } from '../utils/api';
import { useMusicPlaybackActions } from './musicPlayer/actions';
import { getFromStorage, saveToStorage, STORAGE_KEYS } from './musicPlayer/storage';
import type { UseMusicPlayerReturn } from './musicPlayer/types';

export const useMusicPlayer = (initialVolume?: number): UseMusicPlayerReturn => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handleNextRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);

  const [state, setState] = useState<MusicPlayerState>({
    playbackStatus: 'stopped',
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    playlistName: null,
    progress: 0,
    currentTime: 0,
    duration: 0,
    volume: initialVolume ?? 70,
    isLoading: false,
    playHistory: getFromStorage(STORAGE_KEYS.PLAY_HISTORY, []),
  });

  useEffect(() => {
    if (!isInitializedRef.current) {
      return;
    }

    saveToStorage(STORAGE_KEYS.PLAY_HISTORY, state.playHistory);
  }, [state.playHistory]);

  useEffect(() => {
    if (initialVolume !== undefined && audioRef.current) {
      audioRef.current.volume = initialVolume / 100;
      setState((prev) => ({ ...prev, volume: initialVolume }));
    }
  }, [initialVolume]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = 'anonymous';
    audioRef.current.volume = (initialVolume ?? state.volume) / 100;

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      if (!audio.duration) {
        return;
      }

      setState((prev) => ({
        ...prev,
        currentTime: audio.currentTime,
        duration: audio.duration,
        progress: (audio.currentTime / audio.duration) * 100,
      }));
    };

    const handleEnded = () => {
      setState((prev) => ({ ...prev, playbackStatus: 'paused', isPlaying: false }));
      setTimeout(() => {
        handleNextRef.current?.();
      }, 3000);
    };

    const handleLoadedMetadata = () => {
      setState((prev) => ({
        ...prev,
        duration: audio.duration,
        isLoading: false,
      }));
    };

    const handleError = (event: Event) => {
      console.error('Audio playback error:', event);
      setState((prev) => ({
        ...prev,
        playbackStatus: prev.playbackStatus === 'playing' ? 'paused' : prev.playbackStatus,
        isPlaying: false,
        isLoading: false,
      }));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const actions = useMusicPlaybackActions({
    audioRef,
    handleNextRef,
    state,
    setState,
  });

  const restoreServerState = useCallback(async (tracks: Track[]) => {
    try {
      const response = await fetch(buildApiUrl('/api/music/state/get'));
      if (!response.ok) {
        return;
      }

      const savedState = await response.json();
      const savedTrack = tracks.find((track) => track.id === savedState.track_id);
      if (!savedTrack || !audioRef.current) {
        return;
      }

      const playbackStatus: PlaybackStatus = 'stopped';
      setState((prev) => ({
        ...prev,
        playbackStatus,
        isPlaying: false,
        currentTrack: savedTrack,
        playlistName: savedState.playlist_name || null,
        isLoading: true,
        currentTime: savedState.position || 0,
        progress: savedState.duration ? (savedState.position / savedState.duration) * 100 : 0,
        duration: savedState.duration || 0,
      }));

      audioRef.current.src = buildApiUrl(`/api/music/track/${savedTrack.id}/audio`);
      audioRef.current.load();

      audioRef.current.addEventListener('loadedmetadata', () => {
        if (savedState.position > 0 && audioRef.current && savedState.position < audioRef.current.duration) {
          audioRef.current.currentTime = savedState.position;
          setState((prev) => ({ ...prev, isLoading: false, duration: audioRef.current!.duration }));
        }

        if (savedState.volume !== undefined && audioRef.current) {
          audioRef.current.volume = savedState.volume / 100;
          setState((prev) => ({ ...prev, volume: savedState.volume }));
        }
      }, { once: true });

      audioRef.current.addEventListener('error', () => {
        setState((prev) => ({ ...prev, isLoading: false }));
      }, { once: true });
    } catch {
      // noop
    }
  }, []);

  const loadPlaylist = useCallback(async (playlistName?: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      let tracks: Track[] = [];

      if (playlistName) {
        const response = await fetch(buildApiUrl(`/api/music/playlist/${playlistName}/tracks`));
        if (response.ok) {
          const data = await response.json();
          tracks = data.tracks || [];
          setState((prev) => ({ ...prev, playlistName }));
        }
      } else {
        const response = await fetch(buildApiUrl('/api/music/tracks'));
        if (response.ok) {
          const data = await response.json();
          tracks = data.tracks || [];
          setState((prev) => ({ ...prev, playlistName: null }));
        }
      }

      setState((prev) => ({
        ...prev,
        playlist: tracks,
        isLoading: false,
        playHistory: prev.playHistory.filter((id) => tracks.some((track) => track.id === id)),
      }));

      if (tracks.length > 0 && !isInitializedRef.current) {
        await restoreServerState(tracks);
        isInitializedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to load playlist:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [restoreServerState]);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, playHistory: [] }));
  }, []);

  const updateServerState = useCallback(async () => {
    if (!state.currentTrack || !audioRef.current) {
      return;
    }

    try {
      const position = Number.isFinite(audioRef.current.currentTime) ? audioRef.current.currentTime : 0;
      const duration = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;

      await fetch(buildApiUrl('/api/music/state/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: state.currentTrack.id,
          position,
          duration,
          playback_status: state.playbackStatus,
          is_playing: state.isPlaying,
          volume: state.volume,
          playlist_name: state.playlistName,
        }),
      });
    } catch {
      // noop
    }
  }, [state.currentTrack, state.playbackStatus, state.isPlaying, state.volume, state.playlistName]);

  useEffect(() => {
    if (state.playbackStatus === 'playing' && state.currentTrack) {
      const interval = setInterval(updateServerState, 30000);
      return () => clearInterval(interval);
    }
  }, [state.playbackStatus, state.currentTrack, updateServerState]);

  const pauseWithStateUpdate = useCallback(() => {
    actions.pause();
    updateServerState();
  }, [actions.pause, updateServerState]);

  useEffect(() => {
    if (state.currentTrack) {
      updateServerState();
    }
  }, [state.currentTrack?.id]);

  return {
    ...state,
    play: actions.play,
    pause: pauseWithStateUpdate,
    stop: actions.stop,
    next: actions.next,
    previous: actions.previous,
    seek: actions.seek,
    setVolume: actions.setVolume,
    loadPlaylist,
    loadTrack: actions.loadTrack,
    clearHistory,
    audioElement: audioRef.current,
  };
};
