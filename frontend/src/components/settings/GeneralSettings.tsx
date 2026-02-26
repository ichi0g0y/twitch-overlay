import { StreamStatus } from '@/types';
import React from 'react';

import { BasicSettingsCard } from './general/BasicSettingsCard';
import { FontSettingsCard } from './general/FontSettingsCard';
import { NotificationSettingsCard } from './general/NotificationSettingsCard';

interface GeneralSettingsProps {
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean) => void;
  getBooleanValue: (key: string) => boolean;
  streamStatus: StreamStatus | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploadingFont: boolean;
  handleFontUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  previewText: string;
  setPreviewText: (text: string) => void;
  previewImage: string | null;
  handleFontPreview: () => void;
  handleDeleteFont: () => void;
  handleTestNotification: () => void;
  testingNotification: boolean;
  sections?: Array<'basic' | 'notification' | 'font'>;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  streamStatus,
  fileInputRef,
  uploadingFont,
  handleFontUpload,
  previewText,
  setPreviewText,
  previewImage,
  handleFontPreview,
  handleDeleteFont,
  handleTestNotification,
  testingNotification,
  sections,
}) => {
  const visibleSections = new Set(sections ?? ['basic', 'notification', 'font']);

  return (
    <div className="space-y-6 focus:outline-none">
      {visibleSections.has('basic') && (
        <BasicSettingsCard
          getSettingValue={getSettingValue}
          handleSettingChange={handleSettingChange}
          getBooleanValue={getBooleanValue}
          streamStatus={streamStatus}
        />
      )}

      {visibleSections.has('notification') && (
        <NotificationSettingsCard
          getSettingValue={getSettingValue}
          handleSettingChange={handleSettingChange}
          getBooleanValue={getBooleanValue}
          handleTestNotification={handleTestNotification}
          testingNotification={testingNotification}
        />
      )}

      {visibleSections.has('font') && (
        <FontSettingsCard
          getSettingValue={getSettingValue}
          fileInputRef={fileInputRef}
          uploadingFont={uploadingFont}
          handleFontUpload={handleFontUpload}
          previewText={previewText}
          setPreviewText={setPreviewText}
          previewImage={previewImage}
          handleFontPreview={handleFontPreview}
          handleDeleteFont={handleDeleteFont}
        />
      )}
    </div>
  );
};
