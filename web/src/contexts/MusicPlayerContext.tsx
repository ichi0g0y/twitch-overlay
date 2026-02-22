import React, { createContext, useContext, useEffect } from 'react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { getWebSocketClient } from '../utils/websocket';
import { useSettings } from './SettingsContext';
import type { Track, MusicPlayerState } from '@shared/types/music';

interface MusicPlayerContextValue extends MusicPlayerState {
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  loadPlaylist: (playlistName?: string) => Promise<void>;
  loadTrack: (track: Track) => void;
  clearHistory: () => void;
  audioElement: HTMLAudioElement | null;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toPlaylistName = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return undefined;
};

export const MusicPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings();
  const player = useMusicPlayer(settings?.music_volume);

  // APIからの制御を受け付ける
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    // 音楽制御コマンドを処理
    const unsubMusicControl = wsClient.on('music_control', (command) => {
      // 新形式: { action, data } / 旧形式: { type, value, time, playlist }
      const action = typeof command?.action === 'string'
        ? command.action
        : typeof command?.type === 'string'
          ? command.type
          : undefined;

      if (!action) {
        return;
      }

      const payload = (command?.data && typeof command.data === 'object')
        ? command.data as Record<string, unknown>
        : (command ?? {}) as Record<string, unknown>;

      switch (action) {
        case 'play':
          player.play();
          break;
        case 'pause':
          player.pause();
          break;
        case 'stop':
          player.stop();
          break;
        case 'next':
          player.next();
          break;
        case 'previous':
          player.previous();
          break;
        case 'volume':
          {
            const volume = toNumber(payload.volume ?? payload.value ?? command?.value);
            if (volume !== undefined) {
              player.setVolume(volume);
            }
          }
          break;
        case 'load':
        case 'load_playlist':
          player.loadPlaylist(toPlaylistName(payload.playlist ?? command?.playlist));
          break;
        case 'seek':
          {
            const position = toNumber(
              payload.position ?? payload.time ?? command?.position ?? command?.time,
            );
            if (position !== undefined) {
              player.seek(position);
            }
          }
          break;
      }
    });

    return () => {
      unsubMusicControl();
    };
  }, [player.play, player.pause, player.stop, player.next, player.previous, player.setVolume, player.loadPlaylist, player.seek]);

  return (
    <MusicPlayerContext.Provider value={player}>
      {children}
    </MusicPlayerContext.Provider>
  );
};

export const useMusicPlayerContext = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error('useMusicPlayerContext must be used within MusicPlayerProvider');
  }
  return context;
};
