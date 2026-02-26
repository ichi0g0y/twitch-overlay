import { useMemo, useRef, useState } from 'react';
import type {
  ChromeTranslationDownloadStatus,
  ChromeTranslatorClient,
} from '../../../utils/chromeTranslator';
import { useMicCaptionControllerActions } from './useMicCaptionController.actions';
import { useMicCaptionControllerEffects } from './useMicCaptionController.effects';
import type { MicCaptionConfig, RecState } from './types';

export const useMicCaptionController = ({
  config,
  updateStatus,
}: {
  config: MicCaptionConfig;
  updateStatus: (partial: any) => void;
}) => {
  const {
    antiSexualEnabled,
    bouyomiEnabled,
    bouyomiUrl,
    dualInstanceEnabled,
    enabledSetting,
    interimThrottleMs,
    restartDelayMs,
    shortPauseMs,
    speechLang,
    translationEnabled,
    translationGroups,
    translationRequests,
    translationTargets,
  } = config;

  const [capturing, setCapturing] = useState(false);
  const [recState, setRecState] = useState<RecState>('stopped');
  const [error, setError] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<ChromeTranslationDownloadStatus | null>(null);
  const [translatorSupported, setTranslatorSupported] = useState(false);
  const translatorRef = useRef<ChromeTranslatorClient | null>(null);
  const recognitionsRef = useRef<any[]>([]);
  const recognitionStatesRef = useRef<RecState[]>(['stopped', 'stopped']);
  const activeIndexRef = useRef(0);
  const nextInstanceStartedRef = useRef(false);
  const restartInProgressRef = useRef(false);
  const shortPauseTimerRef = useRef<number | null>(null);
  const lastInterimSentAtRef = useRef(0);
  const lastFinalSentRef = useRef('');
  const shouldRunRef = useRef(false);
  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return Boolean(ctor);
  }, []);

  const { startCapture, stopCapture } = useMicCaptionControllerActions({
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
    translationRequestsLength: translationRequests.length,
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
  });

  useMicCaptionControllerEffects({
    speechSupported,
    enabledSetting,
    capturing,
    recState,
    startCapture,
    stopCapture,
    updateStatus,
    setDownloadStatus,
    translatorRef,
    setTranslatorSupported,
    recognitionsRef,
    speechLang,
    antiSexualEnabled,
    bouyomiEnabled,
    translationEnabled,
    translationTargets,
    downloadStatus,
    dualInstanceEnabled,
    translatorSupported,
    error,
  });

  return { capturing, recState, error, speechSupported, startCapture, stopCapture };
};
