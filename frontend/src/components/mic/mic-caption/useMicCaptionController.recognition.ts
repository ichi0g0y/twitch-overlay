import { attachRecognitionHandlers } from './speechRuntime';
import type { RecState } from './types';
import { speechRecognitionErrorToMessage } from './utils';

export const createRecognitionSetup = ({
  speechLang,
  dualInstanceEnabled,
  recognitionStatesRef,
  activeIndexRef,
  shouldRunRef,
  setRecState,
  scheduleRestart,
  switchToNextInstance,
  sendInterim,
  sendFinal,
  preStartNextInstance,
  clearShortPauseTimer,
  shortPauseMs,
  shortPauseTimerRef,
  getActiveRecognition,
  setError,
}: {
  speechLang: string;
  dualInstanceEnabled: boolean;
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  shouldRunRef: { current: boolean };
  setRecState: (state: RecState) => void;
  scheduleRestart: (reason: string) => void;
  switchToNextInstance: () => void;
  sendInterim: (text: string) => void;
  sendFinal: (text: string) => void;
  preStartNextInstance: (reason: string) => void;
  clearShortPauseTimer: () => void;
  shortPauseMs: number;
  shortPauseTimerRef: { current: number | null };
  getActiveRecognition: () => any;
  setError: (value: string | null) => void;
}) => {
  return (rec: any, index: number) => {
    attachRecognitionHandlers({
      rec,
      index,
      speechLang,
      dualInstanceEnabled,
      recognitionStatesRef,
      activeIndexRef,
      shouldRunRef,
      setRecState,
      scheduleRestart,
      switchToNextInstance,
      sendInterim,
      sendFinal,
      preStartNextInstance,
      clearShortPauseTimer,
      shortPauseMs,
      shortPauseTimerRef,
      getActiveRecognition,
      speechRecognitionErrorToMessage,
      setError: (value) => setError(value),
    });
  };
};
