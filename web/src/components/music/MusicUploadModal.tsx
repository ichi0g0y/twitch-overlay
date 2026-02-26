import { MusicUploadModalView } from './upload/MusicUploadModalView';
import { useMusicUploadQueue } from './upload/useMusicUploadQueue';
import type { MusicUploadModalProps } from './upload/types';

const MusicUploadModal = ({
  isOpen,
  onClose,
  onUploadComplete,
  playlists = [],
  currentPlaylistId,
  initialFiles,
}: MusicUploadModalProps) => {
  const upload = useMusicUploadQueue({
    isOpen,
    onClose,
    onUploadComplete,
    currentPlaylistId,
    initialFiles,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <MusicUploadModalView
      fileInputRef={upload.fileInputRef}
      playlists={playlists}
      selectedPlaylistId={upload.selectedPlaylistId}
      setSelectedPlaylistId={upload.setSelectedPlaylistId}
      isUploading={upload.isUploading}
      dragActive={upload.dragActive}
      uploadQueue={upload.uploadQueue}
      completedCount={upload.completedCount}
      errorCount={upload.errorCount}
      totalCount={upload.totalCount}
      overallProgress={upload.overallProgress}
      onFileSelect={upload.handleFileSelect}
      onDrag={upload.handleDrag}
      onDrop={upload.handleDrop}
      onRetryFailed={upload.retryFailed}
      onClose={upload.handleClose}
    />
  );
};

export default MusicUploadModal;
