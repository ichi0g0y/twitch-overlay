import type { Track } from '@shared/types/music';

export interface MusicPlayerViewModel {
  playbackStatus: 'playing' | 'paused' | 'stopped';
  isPlaying: boolean;
  currentTrack: Track | null;
  playlistName: string | null;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  loadPlaylist: (playlistName?: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  audioElement: HTMLAudioElement | null;
}
