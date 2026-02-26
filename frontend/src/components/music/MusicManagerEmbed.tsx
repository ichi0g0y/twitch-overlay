import MusicUploadModal from './MusicUploadModal';
import BulkActionBar from './manager/BulkActionBar';
import DeleteConfirmModal from './manager/DeleteConfirmModal';
import ManagerToolbar from './manager/ManagerToolbar';
import PaginationControls from './manager/PaginationControls';
import PlaylistPanel from './manager/PlaylistPanel';
import TrackTable from './manager/TrackTable';
import { useMusicManagerController } from './manager/useMusicManagerController';

const MusicManagerEmbed = () => {
  const {
    tracks,
    playlists,
    selectedPlaylist,
    isUploadModalOpen,
    isCreatingPlaylist,
    newPlaylistName,
    isLoading,
    currentPage,
    showDeleteConfirm,
    playlistTracks,
    activeDropdown,
    addingToPlaylist,
    selectedTracks,
    dropdownDirection,
    bulkAddingPlaylist,
    tracksPerPage,
    artworkUrls,
    displayTracks,
    currentTracks,
    totalPages,
    startIndex,
    endIndex,
    dropdownRefs,
    buttonRefs,
    setSelectedPlaylist,
    setIsUploadModalOpen,
    setIsCreatingPlaylist,
    setNewPlaylistName,
    setCurrentPage,
    setShowDeleteConfirm,
    setActiveDropdown,
    setTracksPerPage,
    setSelectedTracks,
    handleDeleteTrack,
    handleDeleteAllTracks,
    handleAddToPlaylist,
    handleCreatePlaylist,
    handleUploadComplete,
    handleSelectAll,
    handleSelectTrack,
    handleBulkAddToPlaylist,
    handleBulkDelete,
    handleUploadClick,
    calculateDropdownPosition,
  } = useMusicManagerController();

  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">読み込み中...</div>;
  }

  return (
    <div>
      <ManagerToolbar
        tracksCount={tracks.length}
        isCreatingPlaylist={isCreatingPlaylist}
        newPlaylistName={newPlaylistName}
        onUploadClick={handleUploadClick}
        onStartCreatePlaylist={() => setIsCreatingPlaylist(true)}
        onCreatePlaylist={handleCreatePlaylist}
        onCancelCreatePlaylist={() => {
          setIsCreatingPlaylist(false);
          setNewPlaylistName('');
        }}
        onDeleteAllClick={() => setShowDeleteConfirm(true)}
        onNewPlaylistNameChange={setNewPlaylistName}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PlaylistPanel
          playlists={playlists}
          selectedPlaylist={selectedPlaylist}
          onSelectPlaylist={setSelectedPlaylist}
        />

        <div className="lg:col-span-2">
          <h3 className="mb-3 font-medium text-gray-900 dark:text-gray-100">
            {selectedPlaylist
              ? `プレイリスト: ${playlists.find((playlist) => playlist.id === selectedPlaylist)?.name} (${displayTracks.length}曲)`
              : `トラック (${tracks.length}曲)`}
          </h3>

          <TrackTable
            displayTracks={displayTracks}
            currentTracks={currentTracks}
            selectedTracks={selectedTracks}
            playlists={playlists}
            selectedPlaylist={selectedPlaylist}
            playlistTracks={playlistTracks}
            artworkUrls={artworkUrls}
            activeDropdown={activeDropdown}
            dropdownDirection={dropdownDirection}
            addingToPlaylist={addingToPlaylist}
            buttonRefs={buttonRefs}
            dropdownRefs={dropdownRefs}
            onSelectAll={handleSelectAll}
            onSelectTrack={handleSelectTrack}
            onDeleteTrack={handleDeleteTrack}
            onToggleTrackDropdown={(trackId) => {
              calculateDropdownPosition(trackId);
              setActiveDropdown(activeDropdown === trackId ? null : trackId);
            }}
            onAddToPlaylist={handleAddToPlaylist}
          />

          <PaginationControls
            tracksPerPage={tracksPerPage}
            displayTracksLength={displayTracks.length}
            startIndex={startIndex}
            endIndex={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            onTracksPerPageChange={(value) => {
              setTracksPerPage(value);
              setCurrentPage(1);
              setSelectedTracks([]);
            }}
            onGoToFirstPage={() => {
              setCurrentPage(1);
              setSelectedTracks([]);
            }}
            onGoToPrevPage={() => {
              setCurrentPage((prev) => Math.max(1, prev - 1));
              setSelectedTracks([]);
            }}
            onGoToNextPage={() => {
              setCurrentPage((prev) => Math.min(totalPages, prev + 1));
              setSelectedTracks([]);
            }}
            onGoToLastPage={() => {
              setCurrentPage(totalPages);
              setSelectedTracks([]);
            }}
          />
        </div>
      </div>

      <MusicUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadComplete={handleUploadComplete}
        playlists={playlists}
        currentPlaylistId={selectedPlaylist}
        initialFiles={(window as Window & { tempUploadFiles?: File[] }).tempUploadFiles}
      />

      <BulkActionBar
        selectedTracksCount={selectedTracks.length}
        playlists={playlists}
        activeDropdown={activeDropdown}
        bulkAddingPlaylist={bulkAddingPlaylist}
        onOpenBulkDropdown={() => setActiveDropdown('bulk')}
        onBulkAddToPlaylist={handleBulkAddToPlaylist}
        onBulkDelete={handleBulkDelete}
        onClearSelection={() => setSelectedTracks([])}
        onCloseBulkDropdown={() => setActiveDropdown(null)}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        tracksCount={tracks.length}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteAllTracks}
      />
    </div>
  );
};

export default MusicManagerEmbed;
