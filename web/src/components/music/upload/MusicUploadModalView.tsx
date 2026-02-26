import React from 'react';
import type { Playlist } from '@shared/types/music';
import type { FileUploadStatus } from './types';

interface MusicUploadModalViewProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (value: string | null) => void;
  isUploading: boolean;
  dragActive: boolean;
  uploadQueue: FileUploadStatus[];
  completedCount: number;
  errorCount: number;
  totalCount: number;
  overallProgress: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onRetryFailed: () => void;
  onClose: () => void;
}

export const MusicUploadModalView: React.FC<MusicUploadModalViewProps> = ({
  fileInputRef,
  playlists,
  selectedPlaylistId,
  setSelectedPlaylistId,
  isUploading,
  dragActive,
  uploadQueue,
  completedCount,
  errorCount,
  totalCount,
  overallProgress,
  onFileSelect,
  onDrag,
  onDrop,
  onRetryFailed,
  onClose,
}) => {
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
              onChange={(e) => setSelectedPlaylistId(e.target.value || null)}
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
              <option value=''>なし（すべての曲のみ）</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragActive ? '#1db954' : '#444'}`,
            borderRadius: '8px',
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: dragActive ? '#2a2a2a' : 'transparent',
            transition: 'all 0.2s',
            marginBottom: '20px',
          }}
        >
          <input
            ref={fileInputRef}
            type='file'
            accept='.mp3,.wav,.m4a,.ogg'
            multiple
            onChange={onFileSelect}
            disabled={isUploading}
            style={{ display: 'none' }}
          />

          <p style={{ marginBottom: '10px' }}>ファイルをドラッグ&ドロップ</p>
          <p style={{ marginBottom: '20px', fontSize: '14px', color: '#888' }}>または</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1db954',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            ファイルを選択
          </button>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            MP3, WAV, M4A, OGG (最大50MB/ファイル)
          </p>
        </div>

        {uploadQueue.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', maxHeight: '300px' }}>
            {totalCount > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>
                    アップロード中 ({completedCount}/{totalCount})
                  </span>
                  {errorCount > 0 && (
                    <button
                      onClick={onRetryFailed}
                      style={{
                        padding: '2px 10px',
                        fontSize: '12px',
                        backgroundColor: '#d32f2f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      失敗した{errorCount}件を再試行
                    </button>
                  )}
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#2a2a2a',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${overallProgress}%`,
                      height: '100%',
                      backgroundColor: '#1db954',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {uploadQueue.map((file, index) => (
              <div
                key={index}
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '4px',
                  border: `1px solid ${
                    file.status === 'completed' ? '#1db954' : file.status === 'error' ? '#d32f2f' : '#444'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px' }}>
                    {file.status === 'completed' && '✓ '}
                    {file.status === 'error' && '✗ '}
                    {file.status === 'uploading' && '⟳ '}
                    {file.status === 'pending' && '○ '}
                    {file.file.name}
                  </span>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {(file.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>

                {file.status === 'uploading' && (
                  <div
                    style={{
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#444',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${file.progress}%`,
                        height: '100%',
                        backgroundColor: '#1db954',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                )}

                {file.error && (
                  <div style={{ fontSize: '12px', color: '#d32f2f', marginTop: '5px' }}>{file.error}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'right' }}>
          <button
            onClick={onClose}
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
