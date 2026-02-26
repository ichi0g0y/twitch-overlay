import type { ChromeTranslatorClient } from '../../../utils/chromeTranslator';
import type { RecState } from './types';
import {
  useMicCaptionCaptureCallbacks,
  useMicCaptionRecognitionControllers,
  useMicCaptionSendCallbacks,
} from './useMicCaptionController.actions.helpers';

type UseMicCaptionControllerActionsParams = {
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  bouyomiUrl: string;
  dualInstanceEnabled: boolean;
  interimThrottleMs: number;
  restartDelayMs: number;
  shortPauseMs: number;
  speechLang: string;
  translationEnabled: boolean;
  translationGroups: Array<{ target: string; slotIndices: number[] }>;
  translationRequestsLength: number;
  translationTargets: string[];
  translatorSupported: boolean;
  translatorRef: { current: ChromeTranslatorClient | null };
  updateStatus: (partial: any) => void;
  setError: (value: string | null) => void;
  setRecState: (state: RecState) => void;
  setCapturing: (capturing: boolean) => void;
  recognitionsRef: { current: any[] };
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  nextInstanceStartedRef: { current: boolean };
  restartInProgressRef: { current: boolean };
  shortPauseTimerRef: { current: number | null };
  lastInterimSentAtRef: { current: number };
  lastFinalSentRef: { current: string };
  shouldRunRef: { current: boolean };
};

export const useMicCaptionControllerActions = ({
  antiSexualEnabled,
  bouyomiEnabled,
  bouyomiUrl,
  dualInstanceEnabled,
  interimThrottleMs,
  restartDelayMs,
  shortPauseMs,
  speechLang,
  translationEnabled,
  translationGroups,
  translationRequestsLength,
  translationTargets,
  translatorSupported,
  translatorRef,
  updateStatus,
  setError,
  setRecState,
  setCapturing,
  recognitionsRef,
  recognitionStatesRef,
  activeIndexRef,
  nextInstanceStartedRef,
  restartInProgressRef,
  shortPauseTimerRef,
  lastInterimSentAtRef,
  lastFinalSentRef,
  shouldRunRef,
}: UseMicCaptionControllerActionsParams) => {
  const { sendInterim, sendFinal } = useMicCaptionSendCallbacks({
    antiSexualEnabled,
    bouyomiEnabled,
    bouyomiUrl,
    speechLang,
    translationEnabled,
    translationGroups,
    translationRequestsLength,
    translatorSupported,
    translatorRef,
    updateStatus,
    setError,
    interimThrottleMs,
    lastInterimSentAtRef,
    lastFinalSentRef,
  });
  const { clearShortPauseTimer, setupRecognitionInstance } = useMicCaptionRecognitionControllers({
    dualInstanceEnabled,
    restartDelayMs,
    shortPauseMs,
    speechLang,
    setError,
    setRecState,
    recognitionsRef,
    recognitionStatesRef,
    activeIndexRef,
    nextInstanceStartedRef,
    restartInProgressRef,
    shortPauseTimerRef,
    shouldRunRef,
    sendInterim,
    sendFinal,
  });
  return useMicCaptionCaptureCallbacks({
    antiSexualEnabled,
    speechLang,
    translationTargets,
    updateStatus,
    clearShortPauseTimer,
    lastFinalSentRef,
    lastInterimSentAtRef,
    setError,
    shouldRunRef,
    dualInstanceEnabled,
    recognitionsRef,
    recognitionStatesRef,
    activeIndexRef,
    nextInstanceStartedRef,
    setupRecognitionInstance,
    setCapturing,
    setRecState,
    translationEnabled,
    translatorSupported,
    translatorRef,
    translationGroups,
    restartInProgressRef,
  });
};
