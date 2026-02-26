import { preloadWordLists } from '../../../utils/contentFilter';
import type { ChromeTranslatorClient } from '../../../utils/chromeTranslator';
import { getWebSocketClient } from '../../../utils/websocket';
import { ensureMicrophonePermission } from './speechRuntime';
import type { RecState } from './types';
import { resolveMicPermissionErrorMessage } from './utils';

export const scheduleRecognitionRestart = ({
  reason,
  shouldRunRef,
  restartInProgressRef,
  setRecState,
  getActiveRecognition,
  recognitionStatesRef,
  activeIndexRef,
  restartDelayMs,
  setError,
}: {
  reason: string;
  shouldRunRef: { current: boolean };
  restartInProgressRef: { current: boolean };
  setRecState: (state: RecState) => void;
  getActiveRecognition: () => any;
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  restartDelayMs: number;
  setError: (value: string | null) => void;
}) => {
  if (!shouldRunRef.current || restartInProgressRef.current) return;
  restartInProgressRef.current = true;
  setRecState('starting');
  window.setTimeout(() => {
    try {
      const rec = getActiveRecognition();
      if (rec && recognitionStatesRef.current[activeIndexRef.current] === 'stopped') {
        recognitionStatesRef.current[activeIndexRef.current] = 'starting';
        rec.start();
      }
    } catch (error: any) {
      setError(error?.message || `音声認識の再起動に失敗しました (${reason})`);
    } finally {
      restartInProgressRef.current = false;
    }
  }, Math.max(0, restartDelayMs));
};

export const preStartNextRecognitionInstance = ({
  reason,
  dualInstanceEnabled,
  shouldRunRef,
  nextInstanceStartedRef,
  clearShortPauseTimer,
  activeIndexRef,
  recognitionsRef,
  recognitionStatesRef,
  setError,
}: {
  reason: string;
  dualInstanceEnabled: boolean;
  shouldRunRef: { current: boolean };
  nextInstanceStartedRef: { current: boolean };
  clearShortPauseTimer: () => void;
  activeIndexRef: { current: number };
  recognitionsRef: { current: any[] };
  recognitionStatesRef: { current: RecState[] };
  setError: (value: string | null) => void;
}) => {
  if (!dualInstanceEnabled || !shouldRunRef.current || nextInstanceStartedRef.current) return;
  clearShortPauseTimer();
  const nextIndex = (activeIndexRef.current + 1) % 2;
  const nextRec = recognitionsRef.current[nextIndex];
  if (!nextRec) return;

  if (recognitionStatesRef.current[nextIndex] !== 'stopped') {
    nextInstanceStartedRef.current = true;
    return;
  }

  try {
    recognitionStatesRef.current[nextIndex] = 'starting';
    nextRec.start();
    nextInstanceStartedRef.current = true;
  } catch {
    recognitionStatesRef.current[nextIndex] = 'stopped';
    window.setTimeout(() => {
      if (recognitionStatesRef.current[nextIndex] !== 'stopped') return;
      try {
        recognitionStatesRef.current[nextIndex] = 'starting';
        nextRec.start();
        nextInstanceStartedRef.current = true;
      } catch {
        recognitionStatesRef.current[nextIndex] = 'stopped';
        setError(`次の認識インスタンス起動に失敗しました (${reason})`);
      }
    }, 100);
  }
};

export const initializeRecognitionInstances = ({
  ctor,
  dualInstanceEnabled,
  recognitionsRef,
  recognitionStatesRef,
  activeIndexRef,
  nextInstanceStartedRef,
  setupRecognitionInstance,
}: {
  ctor: any;
  dualInstanceEnabled: boolean;
  recognitionsRef: { current: any[] };
  recognitionStatesRef: { current: RecState[] };
  activeIndexRef: { current: number };
  nextInstanceStartedRef: { current: boolean };
  setupRecognitionInstance: (rec: any, index: number) => void;
}) => {
  activeIndexRef.current = 0;
  nextInstanceStartedRef.current = false;
  recognitionStatesRef.current = ['stopped', 'stopped'];
  recognitionsRef.current = Array.from({ length: dualInstanceEnabled ? 2 : 1 }).map(() => new ctor());
  recognitionsRef.current.forEach((rec, idx) => setupRecognitionInstance(rec, idx));
};

export const startCaptureRuntime = async ({
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
}: {
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
  translationGroups: Array<{ target: string; slotIndices: number[] }>;
}) => {
  setError(null);
  clearShortPauseTimer();
  lastFinalSentRef.current = '';
  lastInterimSentAtRef.current = 0;

  const ws = getWebSocketClient();
  if (!ws.isConnected) {
    try { await ws.connect(); } catch {}
  }
  if (antiSexualEnabled) preloadWordLists([speechLang, ...translationTargets]);

  const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!ctor) {
    setError('SpeechRecognition が利用できません（Chrome推奨）');
    updateStatus({ speechSupported: false });
    return;
  }
  updateStatus({ speechSupported: true });

  try {
    await ensureMicrophonePermission();
  } catch (error: any) {
    setError(resolveMicPermissionErrorMessage(error));
    return;
  }

  shouldRunRef.current = true;
  initializeRecognitionInstances({
    ctor,
    dualInstanceEnabled,
    recognitionsRef,
    recognitionStatesRef,
    activeIndexRef,
    nextInstanceStartedRef,
    setupRecognitionInstance,
  });

  try {
    recognitionStatesRef.current[0] = 'starting';
    recognitionsRef.current[0].start();
    setCapturing(true);
    setRecState('starting');
    if (translationEnabled && translatorSupported && translatorRef.current && translationGroups.length > 0) {
      void (async () => {
        for (const { target } of translationGroups) {
          try { await translatorRef.current?.preload(speechLang, target); } catch {}
        }
      })();
    }
  } catch (error: any) {
    setError(error?.message || '音声認識の開始に失敗しました');
    shouldRunRef.current = false;
    setCapturing(false);
    setRecState('stopped');
  }
};

export const stopCaptureRuntime = ({
  shouldRunRef,
  clearShortPauseTimer,
  nextInstanceStartedRef,
  restartInProgressRef,
  setCapturing,
  setRecState,
  recognitionsRef,
}: {
  shouldRunRef: { current: boolean };
  clearShortPauseTimer: () => void;
  nextInstanceStartedRef: { current: boolean };
  restartInProgressRef: { current: boolean };
  setCapturing: (capturing: boolean) => void;
  setRecState: (state: RecState) => void;
  recognitionsRef: { current: any[] };
}) => {
  shouldRunRef.current = false;
  clearShortPauseTimer();
  nextInstanceStartedRef.current = false;
  restartInProgressRef.current = false;
  setCapturing(false);
  setRecState('stopped');
  for (const rec of recognitionsRef.current) {
    try { rec?.stop?.(); } catch {}
  }
};
