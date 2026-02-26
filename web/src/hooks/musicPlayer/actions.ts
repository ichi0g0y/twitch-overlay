import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { MusicPlayerState, Track } from '@shared/types/music';
import { buildApiUrl } from '../../utils/api';

interface UseMusicPlaybackActionsParams {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  handleNextRef: React.MutableRefObject<(() => void) | null>;
  state: MusicPlayerState;
  setState: React.Dispatch<React.SetStateAction<MusicPlayerState>>;
}

export const useMusicPlaybackActions = ({
  audioRef,
  handleNextRef,
  state,
  setState,
}: UseMusicPlaybackActionsParams) => {
  const getNextRandomTrack = useCallback((): Track | null => {
    if (state.playlist.length === 0) {
      return null;
    }

    const unplayedTracks = state.playlist.filter((track) => !state.playHistory.includes(track.id));

    if (unplayedTracks.length === 0) {
      setState((prev) => ({ ...prev, playHistory: [] }));
      const availableTracks = state.playlist.filter((track) => track.id !== state.currentTrack?.id);
      if (availableTracks.length === 0) {
        return state.playlist[0];
      }
      const randomIndex = Math.floor(Math.random() * availableTracks.length);
      return availableTracks[randomIndex];
    }

    const randomIndex = Math.floor(Math.random() * unplayedTracks.length);
    return unplayedTracks[randomIndex];
  }, [state.playlist, state.playHistory, state.currentTrack]);

  const loadTrack = useCallback((track: Track, autoPlay = false) => {
    if (!audioRef.current) {
      return;
    }

    setState((prev) => ({
      ...prev,
      currentTrack: track,
      isLoading: true,
      currentTime: 0,
      progress: 0,
    }));

    audioRef.current.src = buildApiUrl(`/api/music/track/${track.id}/audio`);
    audioRef.current.load();

    if (autoPlay || state.playbackStatus === 'playing') {
      audioRef.current.play().then(() => {
        setState((prev) => ({
          ...prev,
          playbackStatus: 'playing',
          isPlaying: true,
          isLoading: false,
        }));
      }).catch((error) => {
        console.error('Failed to auto-play:', error);
        setState((prev) => ({
          ...prev,
          playbackStatus: 'paused',
          isPlaying: false,
          isLoading: false,
        }));
      });
    }
  }, [state.playbackStatus]);

  const play = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    if (!state.currentTrack && state.playlist.length > 0) {
      const firstTrack = getNextRandomTrack();
      if (firstTrack) {
        loadTrack(firstTrack, true);
      }
      return;
    }

    if (state.playbackStatus === 'stopped' && state.currentTrack) {
      loadTrack(state.currentTrack, true);
      return;
    }

    audioRef.current.play().then(() => {
      setState((prev) => ({ ...prev, playbackStatus: 'playing', isPlaying: true }));
    }).catch((error) => {
      console.error('Failed to play:', error);
    });
  }, [state.currentTrack, state.playlist, state.playbackStatus, getNextRandomTrack, loadTrack]);

  const pause = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    setState((prev) => ({ ...prev, playbackStatus: 'paused', isPlaying: false }));
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      audioRef.current.load();
    }

    setState((prev) => ({
      ...prev,
      playbackStatus: 'stopped',
      isPlaying: false,
      currentTime: 0,
      progress: 0,
      duration: prev.duration,
      playHistory: [],
    }));
  }, []);

  const next = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState((prev) => ({ ...prev, playbackStatus: 'paused', isPlaying: false }));

    setTimeout(() => {
      const nextTrack = getNextRandomTrack();
      if (nextTrack) {
        if (state.currentTrack) {
          setState((prev) => ({
            ...prev,
            playHistory: [...prev.playHistory, state.currentTrack!.id],
            playbackStatus: 'playing',
            isPlaying: true,
          }));
        } else {
          setState((prev) => ({ ...prev, playbackStatus: 'playing', isPlaying: true }));
        }

        loadTrack(nextTrack, true);
      }
    }, 500);
  }, [getNextRandomTrack, loadTrack, state.currentTrack]);

  useEffect(() => {
    handleNextRef.current = next;
  }, [next]);

  const previous = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState((prev) => ({ ...prev, playbackStatus: 'paused', isPlaying: false }));

    setTimeout(() => {
      if (state.playHistory.length > 0) {
        const lastTrackId = state.playHistory[state.playHistory.length - 1];
        const track = state.playlist.find((playlistTrack) => playlistTrack.id === lastTrackId);
        if (track) {
          setState((prev) => ({
            ...prev,
            playHistory: prev.playHistory.slice(0, -1),
            playbackStatus: 'playing',
            isPlaying: true,
          }));
          loadTrack(track, true);
        }
      }
    }, 500);
  }, [state.playHistory, state.playlist, loadTrack]);

  const seek = useCallback((time: number) => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.currentTime = time;
    setState((prev) => ({
      ...prev,
      currentTime: time,
      progress: (time / prev.duration) * 100,
    }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (!audioRef.current) {
      return;
    }

    const clampedVolume = Math.max(0, Math.min(100, volume));
    audioRef.current.volume = clampedVolume / 100;
    setState((prev) => ({ ...prev, volume: clampedVolume }));
  }, []);

  return {
    play,
    pause,
    stop,
    next,
    previous,
    seek,
    setVolume,
    loadTrack,
  };
};
