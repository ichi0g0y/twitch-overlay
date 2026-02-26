import type { Playlist, Track } from '@shared/types/music';

export interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  trackId?: string;
}

export interface MusicUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (track: Track) => void;
  playlists?: Playlist[];
  currentPlaylistId?: string | null;
  initialFiles?: File[];
}
