import { useCallback, useMemo } from 'react';
import type { ChromeTranslatorClient } from '../../../utils/chromeTranslator';
import { sendFinalMessage, sendInterimMessage } from './speechRuntime';
import { createRecognitionSetup } from './useMicCaptionController.recognition';
import {
  preStartNextRecognitionInstance,
  scheduleRecognitionRestart,
  startCaptureRuntime,
  stopCaptureRuntime,
} from './useMicCaptionController.runtime';
import type { RecState } from './types';
import { nowID } from './utils';

type TranslationGroup = { target: string; slotIndices: number[] };

export type MicCaptionSendCallbacksParams = {
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  bouyomiUrl: string;
  speechLang: string;
  translationEnabled: boolean;
  translationGroups: TranslationGroup[];
  translationRequestsLength: number;
  translatorSupported: boolean;
  translatorRef: { current: ChromeTranslatorClient | null };
  updateStatus: (partial: any) => void;
  setError: (value: string | null) => void;
  interimThrottleMs: number;
  lastInterimSentAtRef: { current: number };
  lastFinalSentRef: { current: string };
};

export const useMicCaptionSendCallbacks = ({
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
}: MicCaptionSendCallbacksParams) => {
  const sendInterim = useCallback((text: string) => {
    sendInterimMessage({ text, antiSexualEnabled, interimThrottleMs, speechLang, updateStatus, lastInterimSentAtRef });
  }, [antiSexualEnabled, interimThrottleMs, lastInterimSentAtRef, speechLang, updateStatus]);
  const sendFinal = useCallback((text: string) => {
    void sendFinalMessage({
      text,
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
      lastFinalSentRef,
      nowID,
      setError: (value) => setError(value),
    });
  }, [antiSexualEnabled, bouyomiEnabled, bouyomiUrl, lastFinalSentRef, setError, speechLang, translationEnabled, translationGroups, translationRequestsLength, translatorRef, translatorSupported, updateStatus]);
  return { sendInterim, sendFinal };
};

export type MicCaptionRecognitionControllersParams = {
  dualInstanceEnabled: boolean;
  restartDelayMs: number;
  shortPauseMs: number;
  speechLang: string;
  setError: (value: string | null) => void;
  setRecState: (state: RecState) => void;
  recognitionsRef: { current: any[] };
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  nextInstanceStartedRef: { current: boolean };
  restartInProgressRef: { current: boolean };
  shortPauseTimerRef: { current: number | null };
  shouldRunRef: { current: boolean };
  sendInterim: (text: string) => void;
  sendFinal: (text: string) => void;
};

export const useMicCaptionRecognitionControllers = ({
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
}: MicCaptionRecognitionControllersParams) => {
  const clearShortPauseTimer = useCallback(() => {
    if (shortPauseTimerRef.current === null) return;
    window.clearTimeout(shortPauseTimerRef.current);
    shortPauseTimerRef.current = null;
  }, [shortPauseTimerRef]);
  const getActiveRecognition = useCallback(
    () => recognitionsRef.current[activeIndexRef.current],
    [activeIndexRef, recognitionsRef],
  );
  const switchToNextInstance = useCallback(() => {
    clearShortPauseTimer();
    activeIndexRef.current = (activeIndexRef.current + 1) % 2;
    nextInstanceStartedRef.current = false;
  }, [activeIndexRef, clearShortPauseTimer, nextInstanceStartedRef]);

  const scheduleRestart = useCallback((reason: string) => {
    scheduleRecognitionRestart({
      reason,
      shouldRunRef,
      restartInProgressRef,
      setRecState,
      getActiveRecognition,
      recognitionStatesRef,
      activeIndexRef,
      restartDelayMs,
      setError,
    });
  }, [activeIndexRef, getActiveRecognition, recognitionStatesRef, restartDelayMs, restartInProgressRef, setError, setRecState, shouldRunRef]);
  const preStartNextInstance = useCallback((reason: string) => {
    preStartNextRecognitionInstance({
      reason,
      dualInstanceEnabled,
      shouldRunRef,
      nextInstanceStartedRef,
      clearShortPauseTimer,
      activeIndexRef,
      recognitionsRef,
      recognitionStatesRef,
      setError,
    });
  }, [activeIndexRef, clearShortPauseTimer, dualInstanceEnabled, nextInstanceStartedRef, recognitionsRef, recognitionStatesRef, setError, shouldRunRef]);

  const setupRecognitionInstance = useMemo(() => createRecognitionSetup({
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
  }), [activeIndexRef, clearShortPauseTimer, dualInstanceEnabled, getActiveRecognition, preStartNextInstance, recognitionStatesRef, scheduleRestart, sendFinal, sendInterim, setError, setRecState, shortPauseMs, shortPauseTimerRef, shouldRunRef, speechLang, switchToNextInstance]);

  return { clearShortPauseTimer, setupRecognitionInstance };
};

export type MicCaptionCaptureCallbacksParams = {
  antiSexualEnabled: boolean;
  speechLang: string;
  translationTargets: string[];
  updateStatus: (partial: any) => void;
  clearShortPauseTimer: () => void;
  lastFinalSentRef: { current: string };
  lastInterimSentAtRef: { current: number };
  setError: (value: string | null) => void;
  shouldRunRef: { current: boolean };
  dualInstanceEnabled: boolean;
  recognitionsRef: { current: any[] };
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  nextInstanceStartedRef: { current: boolean };
  setupRecognitionInstance: (rec: any, index: number) => void;
  setCapturing: (capturing: boolean) => void;
  setRecState: (state: RecState) => void;
  translationEnabled: boolean;
  translatorSupported: boolean;
  translatorRef: { current: ChromeTranslatorClient | null };
  translationGroups: TranslationGroup[];
  restartInProgressRef: { current: boolean };
};

export const useMicCaptionCaptureCallbacks = ({
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
}: MicCaptionCaptureCallbacksParams) => {
  const startCapture = useCallback(async () => {
    await startCaptureRuntime({
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
    });
  }, [activeIndexRef, antiSexualEnabled, clearShortPauseTimer, dualInstanceEnabled, lastFinalSentRef, lastInterimSentAtRef, nextInstanceStartedRef, recognitionsRef, recognitionStatesRef, setCapturing, setError, setRecState, setupRecognitionInstance, shouldRunRef, speechLang, translationEnabled, translationGroups, translationTargets, translatorRef, translatorSupported, updateStatus]);
  const stopCapture = useCallback(() => {
    stopCaptureRuntime({
      shouldRunRef,
      clearShortPauseTimer,
      nextInstanceStartedRef,
      restartInProgressRef,
      setCapturing,
      setRecState,
      recognitionsRef,
    });
  }, [clearShortPauseTimer, nextInstanceStartedRef, recognitionsRef, restartInProgressRef, setCapturing, setRecState, shouldRunRef]);
  return { startCapture, stopCapture };
};
