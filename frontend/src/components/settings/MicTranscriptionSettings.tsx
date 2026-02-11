import React from 'react';
import { MicIntegrationSettingsCard } from './mic/MicIntegrationSettingsCard';
import { MicOverlayDisplaySettingsCard } from './mic/MicOverlayDisplaySettingsCard';
import { MicSpeechSettingsCard } from './mic/MicSpeechSettingsCard';
import { MicTranslationSettingsCard } from './mic/MicTranslationSettingsCard';
import { MicTranslationStyleSettingsCard } from './mic/MicTranslationStyleSettingsCard';

export const MicTranscriptionSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <MicSpeechSettingsCard />
      <MicTranslationSettingsCard />
      <MicTranslationStyleSettingsCard />
      <MicIntegrationSettingsCard />
      <MicOverlayDisplaySettingsCard />
    </div>
  );
};
