import type React from 'react';

export interface FontInfo {
  hasCustomFont: boolean;
  filename?: string;
  fileSize?: number;
  modifiedAt?: string;
}

export interface AuthInfo {
  authUrl: string;
  authenticated: boolean;
  expiresAt?: number | null;
  error?: string | null;
}

export interface SettingsProps {
  onClose?: () => void;
}

export interface LegacySettingsViewState {
  fontInfo: FontInfo;
  authInfo: AuthInfo | null;
  uploading: boolean;
  previewText: string;
  previewImage: string;
  dragActive: boolean;
  error: string;
  success: string;
}

export interface LegacySettingsViewActions {
  setPreviewText: (value: string) => void;
  fetchAuthStatus: () => Promise<void>;
  generatePreview: (text?: string, showError?: boolean) => Promise<void>;
  handleDeleteFont: () => Promise<void>;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatFileSize: (bytes: number) => string;
}
