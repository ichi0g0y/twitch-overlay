import type React from 'react';
import type { Playlist, Track } from '@shared/types/music';
import { MusicPagination } from './MusicPagination';
import { MusicPlaylistPanel } from './MusicPlaylistPanel';
import { MusicTracksTable } from './MusicTracksTable';

interface MusicManagerContentProps {
  tracks: Track[];
  playlists: Playlist[];
  playlistTracks: Track[];
  selectedPlaylist: string | null;
  displayTracks: Track[];
  currentTracks: Track[];
  selectedTracks: string[];
  activeDropdown: string | null;
  addingToPlaylist: string | null;
  dropdownDirection: Record<string, 'up' | 'down'>;
  dropdownRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  buttonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  tracksPerPage: number;
  startIndex: number;
  endIndex: number;
  currentPage: number;
  totalPages: number;
  onSelectPlaylist: (playlistId: string | null) => void;
  onSelectAll: () => void;
  onSelectTrack: (trackId: string, shiftKey: boolean) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleDropdown: (trackId: string, event: React.MouseEvent) => void;
  onAddToPlaylist: (trackId: string, playlistId: string) => void;
  onChangeTracksPerPage: (value: number) => void;
  onGoFirstPage: () => void;
  onGoPreviousPage: () => void;
  onGoNextPage: () => void;
  onGoLastPage: () => void;
}

export const MusicManagerContent = ({
  tracks,
  playlists,
  playlistTracks,
  selectedPlaylist,
  displayTracks,
  currentTracks,
  selectedTracks,
  activeDropdown,
  addingToPlaylist,
  dropdownDirection,
  dropdownRefs,
  buttonRefs,
  tracksPerPage,
  startIndex,
  endIndex,
  currentPage,
  totalPages,
  onSelectPlaylist,
  onSelectAll,
  onSelectTrack,
  onDeleteTrack,
  onToggleDropdown,
  onAddToPlaylist,
  onChangeTracksPerPage,
  onGoFirstPage,
  onGoPreviousPage,
  onGoNextPage,
  onGoLastPage,
}: MusicManagerContentProps) => {
  return (
    <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
      <MusicPlaylistPanel
        playlists={playlists}
        selectedPlaylist={selectedPlaylist}
        onSelectPlaylist={onSelectPlaylist}
      />

      <div className='lg:col-span-2'>
        <MusicTracksTable
          tracksCount={tracks.length}
          selectedPlaylist={selectedPlaylist}
          playlists={playlists}
          playlistTracks={playlistTracks}
          displayTracks={displayTracks}
          currentTracks={currentTracks}
          selectedTracks={selectedTracks}
          activeDropdown={activeDropdown}
          addingToPlaylist={addingToPlaylist}
          dropdownDirection={dropdownDirection}
          dropdownRefs={dropdownRefs}
          buttonRefs={buttonRefs}
          onSelectAll={onSelectAll}
          onSelectTrack={onSelectTrack}
          onDeleteTrack={onDeleteTrack}
          onToggleDropdown={onToggleDropdown}
          onAddToPlaylist={onAddToPlaylist}
        />

        <MusicPagination
          displayTracksCount={displayTracks.length}
          tracksPerPage={tracksPerPage}
          startIndex={startIndex}
          endIndex={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onChangeTracksPerPage={onChangeTracksPerPage}
          onGoFirst={onGoFirstPage}
          onGoPrevious={onGoPreviousPage}
          onGoNext={onGoNextPage}
          onGoLast={onGoLastPage}
        />
      </div>
    </div>
  );
};
