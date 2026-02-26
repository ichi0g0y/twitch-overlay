import type React from 'react';
import type { Playlist, Track } from '@shared/types/music';

export type DropdownDirection = Record<string, 'up' | 'down'>;

export interface ManagerToolbarProps {
  tracksCount: number;
  isCreatingPlaylist: boolean;
  newPlaylistName: string;
  onUploadClick: () => void;
  onStartCreatePlaylist: () => void;
  onCreatePlaylist: () => void;
  onCancelCreatePlaylist: () => void;
  onDeleteAllClick: () => void;
  onNewPlaylistNameChange: (value: string) => void;
}

export interface PlaylistPanelProps {
  playlists: Playlist[];
  selectedPlaylist: string | null;
  onSelectPlaylist: (playlistId: string | null) => void;
}

export interface TrackTableProps {
  displayTracks: Track[];
  currentTracks: Track[];
  selectedTracks: string[];
  playlists: Playlist[];
  selectedPlaylist: string | null;
  playlistTracks: Track[];
  artworkUrls: Record<string, string>;
  activeDropdown: string | null;
  dropdownDirection: DropdownDirection;
  addingToPlaylist: string | null;
  buttonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  dropdownRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onSelectAll: () => void;
  onSelectTrack: (trackId: string, shiftKey: boolean) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleTrackDropdown: (trackId: string) => void;
  onAddToPlaylist: (trackId: string, playlistId: string) => void;
}

export interface PaginationControlsProps {
  tracksPerPage: number;
  displayTracksLength: number;
  startIndex: number;
  endIndex: number;
  currentPage: number;
  totalPages: number;
  onTracksPerPageChange: (value: number) => void;
  onGoToFirstPage: () => void;
  onGoToPrevPage: () => void;
  onGoToNextPage: () => void;
  onGoToLastPage: () => void;
}

export interface BulkActionBarProps {
  selectedTracksCount: number;
  playlists: Playlist[];
  activeDropdown: string | null;
  bulkAddingPlaylist: string | null;
  onOpenBulkDropdown: () => void;
  onBulkAddToPlaylist: (playlistId: string) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  onCloseBulkDropdown: () => void;
}

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  tracksCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}
