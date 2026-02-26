import type { UploadDropZoneProps } from './types';

const UploadDropZone = ({
  isUploading,
  dragActive,
  onDrag,
  onDrop,
  onFileSelect,
  fileInputRef,
}: UploadDropZoneProps) => {
  return (
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
        type="file"
        accept=".mp3,.wav,.m4a,.ogg"
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
      <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>MP3, WAV, M4A, OGG (最大50MB/ファイル)</p>
    </div>
  );
};

export default UploadDropZone;
