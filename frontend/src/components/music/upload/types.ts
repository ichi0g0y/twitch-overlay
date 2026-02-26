import type React from 'react';

export interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  trackId?: string;
}

export interface UploadDropZoneProps {
  isUploading: boolean;
  dragActive: boolean;
  onDrag: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export interface UploadProgressListProps {
  uploadQueue: FileUploadStatus[];
  completedCount: number;
  errorCount: number;
  totalCount: number;
  overallProgress: number;
  onRetryFailed: () => void;
}
