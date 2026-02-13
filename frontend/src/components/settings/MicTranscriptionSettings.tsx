import React from 'react';
import { MicOverlayDisplaySettingsCard } from './mic/MicOverlayDisplaySettingsCard';
import { MicSpeechSettingsCard } from './mic/MicSpeechSettingsCard';

export const MicTranscriptionSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <MicSpeechSettingsCard />
      <MicOverlayDisplaySettingsCard />
    </div>
  );
};
