import React from 'react';
import { LegacySettingsModal } from './settings-legacy/LegacySettingsModal';
import type { SettingsProps } from './settings-legacy/types';
import { useLegacySettingsController } from './settings-legacy/useLegacySettingsController';

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const controller = useLegacySettingsController();
  return (
    <LegacySettingsModal
      state={controller.state}
      actions={controller.actions}
      fileInputRef={controller.fileInputRef}
      onClose={onClose}
    />
  );
};
