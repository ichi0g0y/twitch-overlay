import { talkBouyomiChan } from '../../../utils/bouyomiChan';
import { filterWithCachedLists } from '../../../utils/contentFilter';
import { getWebSocketClient } from '../../../utils/websocket';
import type { ChromeTranslatorClient } from '../../../utils/chromeTranslator';

type RecState = 'stopped' | 'starting' | 'running';

export const ensureMicrophonePermission = async (): Promise<void> => {
  if (!window.isSecureContext) {
    throw new Error('マイク権限はHTTPSまたはlocalhostのみ利用できます。localhostで開いてください');
  }
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
};

export const sendInterimMessage = ({
  text,
  antiSexualEnabled,
  interimThrottleMs,
  speechLang,
  updateStatus,
  lastInterimSentAtRef,
}: {
  text: string;
  antiSexualEnabled: boolean;
  interimThrottleMs: number;
  speechLang: string;
  updateStatus: (partial: any) => void;
  lastInterimSentAtRef: { current: number };
}): void => {
  if (!text.trim()) return;
  const now = Date.now();
  const throttle = Math.max(0, interimThrottleMs);
  if (throttle > 0 && now - lastInterimSentAtRef.current < throttle) return;
  lastInterimSentAtRef.current = now;

  const displayText = antiSexualEnabled ? filterWithCachedLists(text, speechLang) : text;
  updateStatus({ lastInterimText: displayText, lastUpdatedAtMs: now });
  getWebSocketClient().send('mic_transcript', {
    id: 'interim',
    text: displayText,
    is_interim: true,
    timestamp_ms: now,
    source: 'web_speech',
    language: speechLang,
  });
};

export const sendFinalMessage = async ({
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
  setError,
}: {
  text: string;
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  bouyomiUrl: string;
  speechLang: string;
  translationEnabled: boolean;
  translationGroups: Array<{ target: string; slotIndices: number[] }>;
  translationRequestsLength: number;
  translatorSupported: boolean;
  translatorRef: { current: ChromeTranslatorClient | null };
  updateStatus: (partial: any) => void;
  lastFinalSentRef: { current: string };
  nowID: (prefix: string) => string;
  setError: (value: string) => void;
}): Promise<void> => {
  const trimmed = text.trim();
  if (!trimmed || lastFinalSentRef.current === trimmed) return;
  lastFinalSentRef.current = trimmed;

  const id = nowID('mic');
  const timestamp = Date.now();
  const ws = getWebSocketClient();
  const displayText = antiSexualEnabled ? filterWithCachedLists(trimmed, speechLang) : trimmed;
  updateStatus({ lastFinalText: displayText, lastInterimText: '', lastUpdatedAtMs: timestamp });

  const canTranslate = translationEnabled && translatorSupported && translatorRef.current && translationRequestsLength > 0;
  ws.send('mic_transcript', {
    id,
    text: displayText,
    is_interim: false,
    timestamp_ms: timestamp,
    source: 'web_speech',
    language: speechLang,
    expected_translations: canTranslate ? translationRequestsLength : 0,
  });

  if (bouyomiEnabled) {
    void talkBouyomiChan(displayText, bouyomiUrl ? { url: bouyomiUrl } : {}).catch(() => {});
  }
  if (!canTranslate) return;

  const translator = translatorRef.current!;
  for (const { target, slotIndices } of translationGroups) {
    try {
      const res = await translator.translate(trimmed, speechLang, target);
      const translated = (res.translatedText || '').trim();
      if (!translated || translated === trimmed) continue;
      const filtered = antiSexualEnabled ? filterWithCachedLists(translated, target) : translated;
      if (!filtered.trim()) continue;

      for (const slotIndex of slotIndices) {
        ws.send('mic_transcript_translation', {
          id,
          translation: filtered,
          source_language: res.sourceLanguage || speechLang,
          target_language: res.targetLanguage || target,
          slot_index: slotIndex,
        });
      }
    } catch (e: any) {
      setError(e?.message || '翻訳に失敗しました');
    }
  }
};

export const attachRecognitionHandlers = ({
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
  setError,
}: {
  rec: any;
  index: number;
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
  speechRecognitionErrorToMessage: (code: string) => string;
  setError: (value: string) => void;
}): void => {
  rec.lang = speechLang;
  rec.interimResults = true;

  rec.onstart = () => {
    recognitionStatesRef.current[index] = 'running';
    if (index === activeIndexRef.current) setRecState('running');
  };

  rec.onerror = (event: any) => {
    recognitionStatesRef.current[index] = 'stopped';
    if (!shouldRunRef.current) return;
    const code = String(event?.error || event?.message || '').trim();
    if (code === 'aborted') {
      if (!(dualInstanceEnabled && index !== activeIndexRef.current)) scheduleRestart('aborted');
      return;
    }
    setError(speechRecognitionErrorToMessage(code));
    scheduleRestart(code || 'error');
  };

  rec.onend = () => {
    recognitionStatesRef.current[index] = 'stopped';
    if (!shouldRunRef.current) {
      if (index === activeIndexRef.current) setRecState('stopped');
      return;
    }
    if (dualInstanceEnabled && index === activeIndexRef.current) {
      const nextIndex = (activeIndexRef.current + 1) % 2;
      const nextState = recognitionStatesRef.current[nextIndex];
      if (nextState === 'running' || nextState === 'starting') {
        switchToNextInstance();
        setRecState(nextState);
        return;
      }
    }
    if (index === activeIndexRef.current) scheduleRestart('end');
  };

  rec.onresult = (event: any) => {
    if (!shouldRunRef.current || (index !== activeIndexRef.current && !dualInstanceEnabled)) return;

    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript || '';
      if (result?.isFinal) finalText += transcript;
      else interimText += transcript;
    }
    finalText = finalText.trim();
    interimText = interimText.trim();

    if (interimText) {
      const combined = `${finalText}${finalText && interimText ? ' ' : ''}${interimText}`.trim();
      sendInterim(combined);
      if (shortPauseMs > 0) {
        clearShortPauseTimer();
        shortPauseTimerRef.current = window.setTimeout(() => {
          try { getActiveRecognition()?.stop?.(); } catch {}
        }, Math.max(0, shortPauseMs));
      }
      return;
    }

    if (finalText) {
      clearShortPauseTimer();
      sendFinal(finalText);
      preStartNextInstance('final');
    }
  };
};
