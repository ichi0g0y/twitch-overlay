import type { MusicPlayerState, Track } from '@shared/types/music';

export interface UseMusicPlayerReturn extends MusicPlayerState {
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  loadPlaylist: (playlistName?: string) => Promise<void>;
  loadTrack: (track: Track, autoPlay?: boolean) => void;
  clearHistory: () => void;
  audioElement: HTMLAudioElement | null;
}
