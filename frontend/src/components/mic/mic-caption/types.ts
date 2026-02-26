import type { OverlaySettings } from '../../../contexts/SettingsContext';

export type RecState = 'stopped' | 'starting' | 'running';

export type MicCaptionSenderProps = {
  overlaySettings: OverlaySettings | null;
  webServerPort?: number | null;
  onEnabledChange?: (enabled: boolean) => void;
  variant?: 'full' | 'switch_only';
};

export type TranslationRequest = {
  slotIndex: number;
  target: string;
};

export type TranslationGroup = {
  target: string;
  slotIndices: number[];
};

export type MicCaptionConfig = {
  speechLang: string;
  shortPauseMs: number;
  interimThrottleMs: number;
  dualInstanceEnabled: boolean;
  restartDelayMs: number;
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  bouyomiUrl: string;
  translationEnabled: boolean;
  translationRequests: TranslationRequest[];
  translationTargets: string[];
  translationGroups: TranslationGroup[];
  enabledSetting: boolean;
};
