import React, { useRef } from 'react';
import type { Playlist, Track } from '@shared/types/music';
import UploadDropZone from './upload/UploadDropZone';
import UploadProgressList from './upload/UploadProgressList';
import { useMusicUploadQueue } from './upload/useMusicUploadQueue';

interface MusicUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (track: Track) => void;
  playlists?: Playlist[];
  currentPlaylistId?: string | null;
  initialFiles?: File[];
}

const MusicUploadModal = ({
  isOpen,
  onClose,
  onUploadComplete,
  playlists = [],
  currentPlaylistId,
  initialFiles,
}: MusicUploadModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    uploadQueue,
    selectedPlaylistId,
    isUploading,
    dragActive,
    completedCount,
    errorCount,
    totalCount,
    overallProgress,
    setSelectedPlaylistId,
    handleDrag,
    handleDrop,
    processFiles,
    retryFailed,
    closeQueue,
  } = useMusicUploadQueue({
    isOpen,
    currentPlaylistId,
    initialFiles,
    onUploadComplete,
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(event.target.files || []));
  };

  const handleClose = () => {
    if (!closeQueue()) {
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#1e1e1e',
          borderRadius: '8px',
          padding: '24px',
          width: '600px',
          maxWidth: '90%',
          maxHeight: '80vh',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2 style={{ margin: '0 0 20px 0' }}>音楽ファイルのアップロード</h2>

        {playlists.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#aaa' }}>
              プレイリストに追加（オプション）
            </label>
            <select
              value={selectedPlaylistId || ''}
              onChange={(event) => setSelectedPlaylistId(event.target.value || null)}
              disabled={isUploading}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                color: 'white',
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">なし（すべての曲のみ）</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <UploadDropZone
          isUploading={isUploading}
          dragActive={dragActive}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          fileInputRef={fileInputRef}
        />

        <UploadProgressList
          uploadQueue={uploadQueue}
          completedCount={completedCount}
          errorCount={errorCount}
          totalCount={totalCount}
          overallProgress={overallProgress}
          onRetryFailed={retryFailed}
        />

        <div style={{ textAlign: 'right' }}>
          <button
            onClick={handleClose}
            disabled={isUploading}
            style={{
              padding: '8px 20px',
              backgroundColor: '#444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            {isUploading ? 'アップロード中...' : '閉じる'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MusicUploadModal;
