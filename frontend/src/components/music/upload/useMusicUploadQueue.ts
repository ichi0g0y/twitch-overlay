import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { buildApiUrl } from '../../../utils/api';
import type { Track } from '@shared/types/music';
import type { FileUploadStatus } from './types';

interface UseMusicUploadQueueParams {
  isOpen: boolean;
  currentPlaylistId?: string | null;
  initialFiles?: File[];
  onUploadComplete: (track: Track) => void;
}

interface UseMusicUploadQueueResult {
  uploadQueue: FileUploadStatus[];
  selectedPlaylistId: string | null;
  isUploading: boolean;
  dragActive: boolean;
  completedCount: number;
  errorCount: number;
  totalCount: number;
  overallProgress: number;
  setSelectedPlaylistId: (value: string | null) => void;
  handleDrag: (event: DragEvent) => void;
  handleDrop: (event: DragEvent) => void;
  processFiles: (files: File[]) => void;
  retryFailed: () => void;
  closeQueue: () => boolean;
}

const VALID_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/ogg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 3;

const validateFile = (file: File): string | null => {
  const supported = VALID_AUDIO_TYPES.includes(file.type) || file.name.match(/\.(mp3|wav|m4a|ogg)$/i);
  if (!supported) {
    return 'サポートされていないファイル形式です';
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'ファイルサイズが50MBを超えています';
  }

  return null;
};

export const useMusicUploadQueue = ({
  isOpen,
  currentPlaylistId,
  initialFiles,
  onUploadComplete,
}: UseMusicUploadQueueParams): UseMusicUploadQueueResult => {
  const [uploadQueue, setUploadQueue] = useState<FileUploadStatus[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(currentPlaylistId || null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const uploadingCountRef = useRef(0);
  const didProcessInitialFilesRef = useRef(false);

  const checkAllCompleted = useCallback(() => {
    setTimeout(() => {
      setUploadQueue((prev) => {
        const hasUploading = prev.some((item) => item.status === 'uploading' || item.status === 'pending');
        if (!hasUploading) {
          setIsUploading(false);
        }
        return prev;
      });
    }, 100);
  }, []);

  const uploadFile = useCallback(
    (fileStatus: FileUploadStatus) => {
      setUploadQueue((prev) =>
        prev.map((item) => (item.file === fileStatus.file ? { ...item, status: 'uploading' } : item)),
      );

      const formData = new FormData();
      formData.append('file', fileStatus.file);

      if (selectedPlaylistId) {
        formData.append('playlist_id', selectedPlaylistId);
      }

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadQueue((prev) =>
              prev.map((item) => (item.file === fileStatus.file ? { ...item, progress } : item)),
            );
          }
        });

        xhr.addEventListener('load', () => {
          uploadingCountRef.current -= 1;

          if (xhr.status === 200) {
            const track: Track = JSON.parse(xhr.responseText);
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.file === fileStatus.file
                  ? { ...item, status: 'completed', progress: 100, trackId: track.id }
                  : item,
              ),
            );
            onUploadComplete(track);
          } else {
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.file === fileStatus.file
                  ? { ...item, status: 'error', error: `アップロード失敗: ${xhr.statusText}` }
                  : item,
              ),
            );
          }

          checkAllCompleted();
        });

        xhr.addEventListener('error', () => {
          uploadingCountRef.current -= 1;
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.file === fileStatus.file ? { ...item, status: 'error', error: 'ネットワークエラー' } : item,
            ),
          );
          checkAllCompleted();
        });

        xhr.open('POST', buildApiUrl('/api/music/upload'));
        xhr.send(formData);
      } catch (_error) {
        uploadingCountRef.current -= 1;
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.file === fileStatus.file ? { ...item, status: 'error', error: 'アップロードエラー' } : item,
          ),
        );
        checkAllCompleted();
      }
    },
    [checkAllCompleted, onUploadComplete, selectedPlaylistId],
  );

  const startUploadProcess = useCallback(
    async (queue: FileUploadStatus[]) => {
      const pendingFiles = queue.filter((item) => item.status === 'pending');
      if (pendingFiles.length === 0) {
        return;
      }

      setIsUploading(true);

      for (const fileStatus of pendingFiles) {
        while (uploadingCountRef.current >= MAX_CONCURRENT_UPLOADS) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        uploadingCountRef.current += 1;
        uploadFile(fileStatus);
      }
    },
    [uploadFile],
  );

  const processFiles = useCallback(
    (files: File[]) => {
      const validatedFiles: FileUploadStatus[] = files.map((file) => {
        const error = validateFile(file);
        if (error) {
          return {
            file,
            status: 'error',
            progress: 0,
            error,
          };
        }

        return {
          file,
          status: 'pending',
          progress: 0,
        };
      });

      setUploadQueue((prev) => [...prev, ...validatedFiles]);
      void startUploadProcess(validatedFiles);
    },
    [startUploadProcess],
  );

  useEffect(() => {
    if (!isOpen) {
      didProcessInitialFilesRef.current = false;
      return;
    }

    if (didProcessInitialFilesRef.current) {
      return;
    }

    if (initialFiles && initialFiles.length > 0) {
      didProcessInitialFilesRef.current = true;
      processFiles(initialFiles);
      (window as Window & { tempUploadFiles?: File[] }).tempUploadFiles = undefined;
    }
  }, [initialFiles, isOpen, processFiles]);

  const handleDrag = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
      return;
    }

    if (event.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      processFiles(Array.from(event.dataTransfer.files));
    },
    [processFiles],
  );

  const retryFailed = useCallback(() => {
    const failedFiles = uploadQueue.filter((item) => item.status === 'error');
    const resetFiles: FileUploadStatus[] = failedFiles.map((item) => ({
      ...item,
      status: 'pending',
      progress: 0,
    }));

    setUploadQueue((prev) =>
      prev.map((item) => {
        const reset = resetFiles.find((candidate) => candidate.file === item.file);
        return reset || item;
      }),
    );

    void startUploadProcess(resetFiles);
  }, [startUploadProcess, uploadQueue]);

  const closeQueue = useCallback(() => {
    if (isUploading) {
      return false;
    }

    setUploadQueue([]);
    setSelectedPlaylistId(currentPlaylistId || null);
    return true;
  }, [currentPlaylistId, isUploading]);

  const completedCount = uploadQueue.filter((item) => item.status === 'completed').length;
  const errorCount = uploadQueue.filter((item) => item.status === 'error').length;
  const totalCount = uploadQueue.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
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
  };
};
