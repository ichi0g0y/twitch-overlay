import React, { useRef, useState } from 'react';
import type { Track } from '@shared/types/music';
import { buildApiUrl } from '../../../utils/api';
import type { FileUploadStatus } from './types';

interface UseMusicUploadQueueParams {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (track: Track) => void;
  currentPlaylistId: string | null | undefined;
  initialFiles: File[] | undefined;
}

const VALID_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/ogg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 3;

export const useMusicUploadQueue = ({
  isOpen,
  onClose,
  onUploadComplete,
  currentPlaylistId,
  initialFiles,
}: UseMusicUploadQueueParams) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingCountRef = useRef(0);
  const [uploadQueue, setUploadQueue] = useState<FileUploadStatus[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(currentPlaylistId || null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  React.useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      processFiles(initialFiles);
      (window as any).tempUploadFiles = undefined;
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const processFiles = (files: File[]) => {
    const validFiles: FileUploadStatus[] = [];

    for (const file of files) {
      if (!VALID_TYPES.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
        validFiles.push({
          file,
          status: 'error',
          progress: 0,
          error: 'サポートされていないファイル形式です',
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          status: 'error',
          progress: 0,
          error: 'ファイルサイズが50MBを超えています',
        });
        continue;
      }

      validFiles.push({
        file,
        status: 'pending',
        progress: 0,
      });
    }

    setUploadQueue((prev) => [...prev, ...validFiles]);

    if (!isUploading) {
      startUploadProcess([...validFiles]);
    }
  };

  const startUploadProcess = async (queue: FileUploadStatus[]) => {
    setIsUploading(true);
    const pendingFiles = queue.filter((file) => file.status === 'pending');

    for (const fileStatus of pendingFiles) {
      while (uploadingCountRef.current >= MAX_CONCURRENT_UPLOADS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      uploadingCountRef.current++;
      uploadFile(fileStatus);
    }
  };

  const uploadFile = async (fileStatus: FileUploadStatus) => {
    setUploadQueue((prev) =>
      prev.map((file) =>
        file.file === fileStatus.file
          ? { ...file, status: 'uploading' }
          : file
      )
    );

    const formData = new FormData();
    formData.append('file', fileStatus.file);
    if (selectedPlaylistId) {
      formData.append('playlist_id', selectedPlaylistId);
    }

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.round((event.loaded / event.total) * 100);
        setUploadQueue((prev) =>
          prev.map((file) =>
            file.file === fileStatus.file
              ? { ...file, progress }
              : file
          )
        );
      });

      xhr.addEventListener('load', () => {
        uploadingCountRef.current--;

        if (xhr.status === 200) {
          const track: Track = JSON.parse(xhr.responseText);
          setUploadQueue((prev) =>
            prev.map((file) =>
              file.file === fileStatus.file
                ? { ...file, status: 'completed', progress: 100, trackId: track.id }
                : file
            )
          );
          onUploadComplete(track);
        } else {
          setUploadQueue((prev) =>
            prev.map((file) =>
              file.file === fileStatus.file
                ? { ...file, status: 'error', error: `アップロード失敗: ${xhr.statusText}` }
                : file
            )
          );
        }

        checkAllCompleted();
      });

      xhr.addEventListener('error', () => {
        uploadingCountRef.current--;
        setUploadQueue((prev) =>
          prev.map((file) =>
            file.file === fileStatus.file
              ? { ...file, status: 'error', error: 'ネットワークエラー' }
              : file
          )
        );
        checkAllCompleted();
      });

      xhr.open('POST', buildApiUrl('/api/music/upload'));
      xhr.send(formData);
    } catch {
      uploadingCountRef.current--;
      setUploadQueue((prev) =>
        prev.map((file) =>
          file.file === fileStatus.file
            ? { ...file, status: 'error', error: 'アップロードエラー' }
            : file
        )
      );
      checkAllCompleted();
    }
  };

  const checkAllCompleted = () => {
    setTimeout(() => {
      setUploadQueue((prev) => {
        const hasUploading = prev.some((file) => file.status === 'uploading' || file.status === 'pending');
        if (!hasUploading) {
          setIsUploading(false);
        }
        return prev;
      });
    }, 100);
  };

  const retryFailed = () => {
    const failedFiles = uploadQueue.filter((file) => file.status === 'error');
    const resetFiles: FileUploadStatus[] = failedFiles.map((file) => ({
      ...file,
      status: 'pending',
      progress: 0,
    }));

    setUploadQueue((prev) =>
      prev.map((file) => {
        const reset = resetFiles.find((resetTarget) => resetTarget.file === file.file);
        return reset || file;
      })
    );

    startUploadProcess(resetFiles);
  };

  const handleClose = () => {
    if (isUploading) {
      return;
    }

    setUploadQueue([]);
    setSelectedPlaylistId(currentPlaylistId || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const completedCount = uploadQueue.filter((file) => file.status === 'completed').length;
  const errorCount = uploadQueue.filter((file) => file.status === 'error').length;
  const totalCount = uploadQueue.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    fileInputRef,
    uploadQueue,
    selectedPlaylistId,
    setSelectedPlaylistId,
    isUploading,
    dragActive,
    handleFileSelect,
    handleDrag,
    handleDrop,
    retryFailed,
    handleClose,
    completedCount,
    errorCount,
    totalCount,
    overallProgress,
  };
};
