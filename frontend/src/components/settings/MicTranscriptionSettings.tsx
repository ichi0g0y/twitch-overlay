import React from 'react';
import { MicOverlayDisplaySettingsCard } from './mic/MicOverlayDisplaySettingsCard';
import { MicSpeechSettingsCard } from './mic/MicSpeechSettingsCard';

interface MicTranscriptionSettingsProps {
  sections?: Array<'speech' | 'overlayDisplay'>;
}

export const MicTranscriptionSettings: React.FC<MicTranscriptionSettingsProps> = ({ sections }) => {
  const visibleSections = new Set(sections ?? ['speech', 'overlayDisplay']);
  return (
    <div className="space-y-6">
      {visibleSections.has('speech') && <MicSpeechSettingsCard />}
      {visibleSections.has('overlayDisplay') && <MicOverlayDisplaySettingsCard />}
    </div>
  );
};
