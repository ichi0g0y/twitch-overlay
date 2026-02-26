import React from 'react';

import { StreamStatus } from '@/types';

export interface GeneralSettingsCommonProps {
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean) => void;
  getBooleanValue: (key: string) => boolean;
}

export interface GeneralSettingsNotificationProps extends GeneralSettingsCommonProps {
  handleTestNotification: () => void;
  testingNotification: boolean;
}

export interface GeneralSettingsFontProps {
  getSettingValue: (key: string) => string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploadingFont: boolean;
  handleFontUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  previewText: string;
  setPreviewText: (text: string) => void;
  previewImage: string | null;
  handleFontPreview: () => void;
  handleDeleteFont: () => void;
}

export interface GeneralSettingsBasicProps extends GeneralSettingsCommonProps {
  streamStatus: StreamStatus | null;
}
