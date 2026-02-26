import type { UploadProgressListProps } from './types';

const UploadProgressList = ({
  uploadQueue,
  completedCount,
  errorCount,
  totalCount,
  overallProgress,
  onRetryFailed,
}: UploadProgressListProps) => {
  if (uploadQueue.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: '20px',
        maxHeight: '300px',
      }}
    >
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

      {uploadQueue.map((uploadFile, index) => (
        <div
          key={`${uploadFile.file.name}-${index}`}
          style={{
            padding: '10px',
            marginBottom: '8px',
            backgroundColor: '#2a2a2a',
            borderRadius: '4px',
            border: `1px solid ${
              uploadFile.status === 'completed' ? '#1db954' : uploadFile.status === 'error' ? '#d32f2f' : '#444'
            }`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '14px' }}>
              {uploadFile.status === 'completed' && '✓ '}
              {uploadFile.status === 'error' && '✗ '}
              {uploadFile.status === 'uploading' && '⟳ '}
              {uploadFile.status === 'pending' && '○ '}
              {uploadFile.file.name}
            </span>
            <span style={{ fontSize: '12px', color: '#888' }}>{(uploadFile.file.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>

          {uploadFile.status === 'uploading' && (
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
                  width: `${uploadFile.progress}%`,
                  height: '100%',
                  backgroundColor: '#1db954',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}

          {uploadFile.error && (
            <div
              style={{
                fontSize: '12px',
                color: '#d32f2f',
                marginTop: '5px',
              }}
            >
              {uploadFile.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default UploadProgressList;
