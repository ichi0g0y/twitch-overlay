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

export const MusicPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings();
  const player = useMusicPlayer(settings?.music_volume);

  // APIからの制御を受け付ける
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    // 音楽制御コマンドを処理
    const unsubMusicControl = wsClient.on('music_control', (command) => {
      // console.log('Music control command received via WebSocket:', command); // デバッグ用ログ
      
      switch (command.type) {
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
          if (typeof command.value === 'number') {
            player.setVolume(command.value);
          }
          break;
        case 'load_playlist':
          if (command.playlist) {
            player.loadPlaylist(command.playlist);
          }
          break;
        case 'seek':
          if (typeof command.time === 'number') {
            player.seek(command.time);
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