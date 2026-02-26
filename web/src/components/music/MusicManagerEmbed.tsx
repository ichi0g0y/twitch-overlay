import MusicUploadModal from './MusicUploadModal';
import { MusicBulkActionBar } from './manager/MusicBulkActionBar';
import { MusicDeleteConfirmDialog } from './manager/MusicDeleteConfirmDialog';
import { MusicManagerContent } from './manager/MusicManagerContent';
import { MusicManagerHeader } from './manager/MusicManagerHeader';
import { useMusicManager } from './manager/useMusicManager';

const MusicManagerEmbed = () => {
  const manager = useMusicManager();

  if (manager.isLoading) {
    return <div className='py-8 text-center text-gray-500'>読み込み中...</div>;
  }

  return (
    <div>
      <MusicManagerHeader
        tracksCount={manager.tracks.length}
        isCreatingPlaylist={manager.isCreatingPlaylist}
        newPlaylistName={manager.newPlaylistName}
        onUploadClick={manager.handleUploadClick}
        onStartCreatePlaylist={() => manager.setIsCreatingPlaylist(true)}
        onDeleteAll={() => manager.setShowDeleteConfirm(true)}
        onCreatePlaylist={manager.handleCreatePlaylist}
        onCancelCreatePlaylist={() => {
          manager.setIsCreatingPlaylist(false);
          manager.setNewPlaylistName('');
        }}
        onChangePlaylistName={manager.setNewPlaylistName}
      />

      <MusicManagerContent
        tracks={manager.tracks}
        playlists={manager.playlists}
        playlistTracks={manager.playlistTracks}
        selectedPlaylist={manager.selectedPlaylist}
        displayTracks={manager.displayTracks}
        currentTracks={manager.currentTracks}
        selectedTracks={manager.selectedTracks}
        activeDropdown={manager.activeDropdown}
        addingToPlaylist={manager.addingToPlaylist}
        dropdownDirection={manager.dropdownDirection}
        dropdownRefs={manager.dropdownRefs}
        buttonRefs={manager.buttonRefs}
        tracksPerPage={manager.tracksPerPage}
        startIndex={manager.startIndex}
        endIndex={manager.endIndex}
        currentPage={manager.currentPage}
        totalPages={manager.totalPages}
        onSelectPlaylist={manager.setSelectedPlaylist}
        onSelectAll={manager.handleSelectAll}
        onSelectTrack={manager.handleSelectTrack}
        onDeleteTrack={manager.handleDeleteTrack}
        onToggleDropdown={(trackId, event) => {
          event.stopPropagation();
          manager.calculateDropdownPosition(trackId);
          manager.setActiveDropdown(manager.activeDropdown === trackId ? null : trackId);
        }}
        onAddToPlaylist={manager.handleAddToPlaylist}
        onChangeTracksPerPage={(value) => {
          manager.setTracksPerPage(value);
          manager.setCurrentPage(1);
          manager.setSelectedTracks([]);
        }}
        onGoFirstPage={() => {
          manager.setCurrentPage(1);
          manager.setSelectedTracks([]);
        }}
        onGoPreviousPage={() => {
          manager.setCurrentPage((prev) => Math.max(1, prev - 1));
          manager.setSelectedTracks([]);
        }}
        onGoNextPage={() => {
          manager.setCurrentPage((prev) => Math.min(manager.totalPages, prev + 1));
          manager.setSelectedTracks([]);
        }}
        onGoLastPage={() => {
          manager.setCurrentPage(manager.totalPages);
          manager.setSelectedTracks([]);
        }}
      />

      <MusicUploadModal
        isOpen={manager.isUploadModalOpen}
        onClose={() => manager.setIsUploadModalOpen(false)}
        onUploadComplete={manager.handleUploadComplete}
        playlists={manager.playlists}
        currentPlaylistId={manager.selectedPlaylist}
        initialFiles={(window as any).tempUploadFiles}
      />

      <MusicBulkActionBar
        selectedCount={manager.selectedTracks.length}
        playlists={manager.playlists}
        activeDropdown={manager.activeDropdown}
        bulkAddingPlaylist={manager.bulkAddingPlaylist}
        onOpenDropdown={() => manager.setActiveDropdown('bulk')}
        onCloseDropdown={() => manager.setActiveDropdown(null)}
        onBulkAddToPlaylist={manager.handleBulkAddToPlaylist}
        onBulkDelete={manager.handleBulkDelete}
        onCancelSelection={() => manager.setSelectedTracks([])}
      />

      <MusicDeleteConfirmDialog
        isOpen={manager.showDeleteConfirm}
        tracksCount={manager.tracks.length}
        onCancel={() => manager.setShowDeleteConfirm(false)}
        onConfirm={manager.handleDeleteAllTracks}
      />
    </div>
  );
};

export default MusicManagerEmbed;
