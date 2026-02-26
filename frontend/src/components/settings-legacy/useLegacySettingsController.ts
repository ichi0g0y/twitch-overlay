import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type {
  LegacySettingsViewActions,
  LegacySettingsViewState,
} from './types';
import {
  deleteFontApi,
  fetchAllSettingsApi,
  fetchAuthStatusApi,
  generatePreviewApi,
  uploadFontApi,
} from './api';
import { FONT_MAX_SIZE_BYTES, formatFileSize, isAllowedFontFile } from './utils';

export interface LegacySettingsController {
  state: LegacySettingsViewState;
  actions: LegacySettingsViewActions;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const useLegacySettingsController = (): LegacySettingsController => {
  const [fontInfo, setFontInfo] = useState({ hasCustomFont: false });
  const [authInfo, setAuthInfo] = useState<LegacySettingsViewState['authInfo']>(null);
  const [uploading, setUploading] = useState(false);
  const [previewText, setPreviewText] = useState('サンプルテキスト Sample Text 123');
  const [previewImage, setPreviewImage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAllSettings = async () => {
    try {
      const data = await fetchAllSettingsApi();
      setFontInfo(data.font || { hasCustomFont: false });
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('設定の取得に失敗しました');
    }
  };

  const fetchAuthStatus = async () => {
    try {
      const data = await fetchAuthStatusApi();
      setAuthInfo(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  };

  const generatePreview = async (text?: string, showError = true) => {
    try {
      const image = await generatePreviewApi(text || previewText);
      setPreviewImage(image);
      if (error.includes('プレビュー生成エラー')) {
        setError('');
      }
    } catch (err) {
      console.error('Failed to generate preview:', err);
      if (showError && err instanceof Error) {
        setError(`プレビュー生成エラー: ${err.message}`);
      }
      throw err;
    }
  };

  useEffect(() => {
    const initialize = async () => {
      await fetchAllSettings();
      await fetchAuthStatus();
      try {
        await generatePreview(undefined, false);
      } catch {
        // ignore initial preview failure
      }
    };
    void initialize();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!isAllowedFontFile(file.name)) {
      setError('TTFまたはOTFファイルのみアップロード可能です');
      return;
    }
    if (file.size > FONT_MAX_SIZE_BYTES) {
      setError('ファイルサイズは50MB以下にしてください');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const nextFontInfo = await uploadFontApi(file);
      setFontInfo(nextFontInfo);
      setSuccess('フォントのアップロードに成功しました');
      await generatePreview();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFont = async () => {
    if (!confirm('カスタムフォントを削除してデフォルトに戻しますか？')) {
      return;
    }

    try {
      await deleteFontApi();
      setFontInfo({ hasCustomFont: false });
      setSuccess('カスタムフォントを削除しました');
      await generatePreview();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('削除に失敗しました');
    }
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void handleFileUpload(e.target.files[0]);
    }
  };

  return {
    state: {
      fontInfo,
      authInfo,
      uploading,
      previewText,
      previewImage,
      dragActive,
      error,
      success,
    },
    actions: {
      setPreviewText,
      fetchAuthStatus,
      generatePreview,
      handleDeleteFont,
      handleDrag,
      handleDrop,
      handleFileSelect,
      formatFileSize,
    },
    fileInputRef,
  };
};
