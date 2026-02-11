import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OverlaySettings } from '../../contexts/SettingsContext';
import { useMicCaptionStatus } from '../../contexts/MicCaptionStatusContext';
import { talkBouyomiChan } from '../../utils/bouyomiChan';
import { ChromeTranslatorClient, type ChromeTranslationDownloadStatus } from '../../utils/chromeTranslator';
import { filterWithCachedLists, preloadWordLists } from '../../utils/contentFilter';
import { getWebSocketClient } from '../../utils/websocket';
import { Switch } from '../ui/switch';

type RecState = 'stopped' | 'starting' | 'running';

function nowID(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function speechRecognitionErrorToMessage(code: string): string {
  switch ((code || '').trim()) {
    case 'aborted':
      return '音声認識が中断されました（再起動中）';
    case 'no-speech':
      return '音声が検出されませんでした';
    case 'audio-capture':
      return 'マイク入力を取得できませんでした（デバイス/権限を確認してください）';
    case 'network':
      return '音声認識のネットワークエラーが発生しました';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'マイク権限が拒否されています。ブラウザ/OSの権限設定を確認してください';
    case 'language-not-supported':
      return '指定した言語が音声認識でサポートされていません';
    case 'bad-grammar':
      return '音声認識の文法設定が不正です';
    default:
      return code || '音声認識エラー';
  }
}

function normalizeSpeechLang(code: string | undefined | null, fallback: string): string {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  // Web Speech API accepts BCP-47 tags (e.g. zh-CN / zh-TW). Keep as-is.
  return raw.replace(/_/g, '-');
}

function normalizeTranslationLang(code: string | undefined | null, fallback: string): string {
  const raw = (code || '').trim();
  if (!raw) return fallback;

  // Chrome Translator API prefers simplified language codes.
  if (raw === 'zh-Hant') return raw;

  const normalized = raw.replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  // Common aliases.
  if (lower === 'zh-tw') return 'zh-Hant';
  if (lower === 'zh-cn') return 'zh';
  if (lower.startsWith('zh-') && lower.includes('hant')) return 'zh-Hant';

  // Default: base language.
  return lower.split('-')[0] || fallback;
}

export const MicCaptionSender: React.FC<{
  overlaySettings: OverlaySettings | null;
  webServerPort?: number | null;
  onEnabledChange?: (enabled: boolean) => void;
  variant?: 'full' | 'switch_only';
}> = ({ overlaySettings, webServerPort, onEnabledChange, variant = 'full' }) => {
  const { updateStatus } = useMicCaptionStatus();

  const speechLang = useMemo(
    () => normalizeSpeechLang(overlaySettings?.mic_transcript_speech_language, 'ja'),
    [overlaySettings?.mic_transcript_speech_language],
  );
  const shortPauseMs = overlaySettings?.mic_transcript_speech_short_pause_ms ?? 800;
  const interimThrottleMs = overlaySettings?.mic_transcript_speech_interim_throttle_ms ?? 200;
  const dualInstanceEnabled = overlaySettings?.mic_transcript_speech_dual_instance_enabled ?? true;
  const restartDelayMs = overlaySettings?.mic_transcript_speech_restart_delay_ms ?? 100;
  const antiSexualEnabled = overlaySettings?.mic_transcript_anti_sexual_enabled ?? false;
  const bouyomiEnabled = overlaySettings?.mic_transcript_bouyomi_enabled ?? false;
  const bouyomiUrl = (overlaySettings?.mic_transcript_bouyomi_url || '').trim();

  const translationMode = overlaySettings?.mic_transcript_translation_mode
    ?? ((overlaySettings?.mic_transcript_translation_enabled ?? false) ? 'chrome' : 'off');
  const translationEnabled = translationMode !== 'off';
  const translationTargets = useMemo(() => {
    if (!translationEnabled) return [];
    const raw1 = (overlaySettings?.mic_transcript_translation_language || '').trim();
    const raw2 = (overlaySettings?.mic_transcript_translation2_language || '').trim();
    const raw3 = (overlaySettings?.mic_transcript_translation3_language || '').trim();
    const candidates = [
      normalizeTranslationLang(raw1 || 'en', ''),
      normalizeTranslationLang(raw2, ''),
      normalizeTranslationLang(raw3, ''),
    ].filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lang of candidates) {
      if (seen.has(lang)) continue;
      seen.add(lang);
      out.push(lang);
    }
    return out;
  }, [
    overlaySettings?.mic_transcript_translation2_language,
    overlaySettings?.mic_transcript_translation3_language,
    overlaySettings?.mic_transcript_translation_language,
    translationEnabled,
  ]);

  const enabledSetting = overlaySettings?.mic_transcript_speech_enabled ?? false;
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
  const lastFinalSentRef = useRef<string>('');
  const shouldRunRef = useRef(false);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return Boolean(SpeechRecognitionCtor);
  }, []);

  const clearShortPauseTimer = useCallback(() => {
    if (shortPauseTimerRef.current !== null) {
      window.clearTimeout(shortPauseTimerRef.current);
      shortPauseTimerRef.current = null;
    }
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    if (!window.isSecureContext) {
      throw new Error('マイク権限はHTTPSまたはlocalhostのみ利用できます。localhostで開いてください');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  }, []);

  const getActiveRecognition = useCallback(() => recognitionsRef.current[activeIndexRef.current], []);

  const switchToNextInstance = useCallback(() => {
    clearShortPauseTimer();
    activeIndexRef.current = (activeIndexRef.current + 1) % 2;
    nextInstanceStartedRef.current = false;
  }, [clearShortPauseTimer]);

  const scheduleRestart = useCallback(
    (reason: string) => {
      if (!shouldRunRef.current) return;
      if (restartInProgressRef.current) return;
      restartInProgressRef.current = true;
      setRecState('starting');
      window.setTimeout(() => {
        try {
          const rec = getActiveRecognition();
          if (rec && recognitionStatesRef.current[activeIndexRef.current] === 'stopped') {
            recognitionStatesRef.current[activeIndexRef.current] = 'starting';
            rec.start();
          }
        } catch (e: any) {
          setError(e?.message || `音声認識の再起動に失敗しました (${reason})`);
        } finally {
          restartInProgressRef.current = false;
        }
      }, Math.max(0, restartDelayMs));
    },
    [getActiveRecognition, restartDelayMs],
  );

  const preStartNextInstance = useCallback(
    (reason: string) => {
      if (!dualInstanceEnabled) return;
      if (!shouldRunRef.current) return;
      if (nextInstanceStartedRef.current) return;

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
    },
    [clearShortPauseTimer, dualInstanceEnabled],
  );

  const sendInterim = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const now = Date.now();
      const throttle = Math.max(0, interimThrottleMs);
      if (throttle > 0 && now - lastInterimSentAtRef.current < throttle) {
        return;
      }
      lastInterimSentAtRef.current = now;

      const displayText = antiSexualEnabled ? filterWithCachedLists(text, speechLang) : text;
      updateStatus({ lastInterimText: displayText, lastUpdatedAtMs: now });
      const ws = getWebSocketClient();
      ws.send('mic_transcript', {
        id: 'interim',
        text: displayText,
        is_interim: true,
        timestamp_ms: now,
        source: 'web_speech',
        language: speechLang,
      });
    },
    [antiSexualEnabled, interimThrottleMs, speechLang, updateStatus],
  );

  const sendFinal = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (lastFinalSentRef.current === trimmed) return;
      lastFinalSentRef.current = trimmed;

      const id = nowID('mic');
      const ts = Date.now();
      const ws = getWebSocketClient();
      const displayText = antiSexualEnabled ? filterWithCachedLists(trimmed, speechLang) : trimmed;
      updateStatus({ lastFinalText: displayText, lastInterimText: '', lastUpdatedAtMs: ts });

      const canTranslate = translationEnabled && translatorSupported
        && translatorRef.current && translationTargets.length > 0;
      const expectedTranslations = canTranslate ? translationTargets.length : 0;

      ws.send('mic_transcript', {
        id,
        text: displayText,
        is_interim: false,
        timestamp_ms: ts,
        source: 'web_speech',
        language: speechLang,
        expected_translations: expectedTranslations,
      });

      if (bouyomiEnabled) {
        void talkBouyomiChan(displayText, bouyomiUrl ? { url: bouyomiUrl } : {}).catch(() => {});
      }

      if (!canTranslate) return;
      const translator = translatorRef.current!;

      await Promise.allSettled(
        translationTargets.map(async (target) => {
          try {
            const res = await translator.translate(trimmed, speechLang, target);
            const translated = (res.translatedText || '').trim();
            if (!translated || translated === trimmed) return;
            const filteredTranslation = antiSexualEnabled
              ? filterWithCachedLists(translated, target)
              : translated;
            ws.send('mic_transcript_translation', {
              id,
              translation: filteredTranslation,
              source_language: res.sourceLanguage || speechLang,
              target_language: res.targetLanguage,
            });
          } catch (e: any) {
            setError(e?.message || '翻訳に失敗しました');
          }
        }),
      );
    },
    [antiSexualEnabled, bouyomiEnabled, bouyomiUrl, speechLang, translationEnabled, translationTargets, translatorSupported, updateStatus],
  );

  const createOnResultHandler = useCallback(
    (index: number) => {
      return (event: any) => {
        if (!shouldRunRef.current) return;
        if (index !== activeIndexRef.current && !dualInstanceEnabled) return;

        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript || '';
          if (result?.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }
        finalText = finalText.trim();
        interimText = interimText.trim();

        const combined = `${finalText}${finalText && interimText ? ' ' : ''}${interimText}`.trim();

        if (interimText) {
          sendInterim(combined);
          if (shortPauseMs > 0) {
            clearShortPauseTimer();
            shortPauseTimerRef.current = window.setTimeout(() => {
              try {
                getActiveRecognition()?.stop?.();
              } catch {
                // ignore
              }
            }, Math.max(0, shortPauseMs));
          }
          return;
        }

        if (finalText) {
          clearShortPauseTimer();
          void sendFinal(finalText);
          preStartNextInstance('final');
        }
      };
    },
    [
      clearShortPauseTimer,
      dualInstanceEnabled,
      getActiveRecognition,
      preStartNextInstance,
      sendFinal,
      sendInterim,
      shortPauseMs,
    ],
  );

  const setupRecognitionInstance = useCallback(
    (rec: any, index: number) => {
      rec.lang = speechLang;
      rec.interimResults = true;

      rec.onstart = () => {
        recognitionStatesRef.current[index] = 'running';
        if (index === activeIndexRef.current) {
          setRecState('running');
        }
      };

      rec.onerror = (event: any) => {
        recognitionStatesRef.current[index] = 'stopped';
        if (!shouldRunRef.current) return;
        const code = String(event?.error || event?.message || '').trim();

        // 'aborted' is very common when dual-instance handover happens; don't surface it as an error.
        if (code === 'aborted') {
          if (dualInstanceEnabled && index !== activeIndexRef.current) {
            return;
          }
          // For active instance, just restart silently.
          scheduleRestart('aborted');
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

        if (index === activeIndexRef.current) {
          scheduleRestart('end');
        }
      };

      rec.onresult = createOnResultHandler(index);
    },
    [createOnResultHandler, dualInstanceEnabled, scheduleRestart, speechLang, switchToNextInstance],
  );

  const startCapture = useCallback(async () => {
    setError(null);
    clearShortPauseTimer();
    lastFinalSentRef.current = '';
    lastInterimSentAtRef.current = 0;

    const ws = getWebSocketClient();
    if (!ws.isConnected) {
      try {
        await ws.connect();
      } catch {
        // ignore
      }
    }

    if (antiSexualEnabled) {
      preloadWordLists([speechLang, ...translationTargets]);
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError('SpeechRecognition が利用できません（Chrome推奨）');
      updateStatus({ speechSupported: false });
      return;
    }
    updateStatus({ speechSupported: true });

    try {
      await ensureMicrophonePermission();
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('マイク権限が拒否されています。Chromeのサイト設定/ macOSのマイク権限を確認してください');
      } else if (name === 'NotFoundError') {
        setError('マイクデバイスが見つかりません。接続/入力デバイス設定を確認してください');
      } else if (name === 'NotReadableError') {
        setError('マイクが他のアプリで使用中の可能性があります。使用中アプリを閉じて再試行してください');
      } else {
        setError(e?.message || 'マイク権限の取得に失敗しました');
      }
      return;
    }

    shouldRunRef.current = true;
    activeIndexRef.current = 0;
    nextInstanceStartedRef.current = false;
    recognitionStatesRef.current = ['stopped', 'stopped'];

    const instances = dualInstanceEnabled ? 2 : 1;
    recognitionsRef.current = Array.from({ length: instances }).map(() => new SpeechRecognitionCtor());
    recognitionsRef.current.forEach((rec, idx) => setupRecognitionInstance(rec, idx));

    try {
      recognitionStatesRef.current[0] = 'starting';
      recognitionsRef.current[0].start();
      setCapturing(true);
      setRecState('starting');

      // Preload translation models in the background (if enabled) so first translation is smoother.
      if (translationEnabled && translatorSupported && translatorRef.current && translationTargets.length > 0) {
        void (async () => {
          for (const target of translationTargets) {
            try {
              await translatorRef.current?.preload(speechLang, target);
            } catch {
              // ignore preload failures; translate() will still try later.
            }
          }
        })();
      }
    } catch (e: any) {
      setError(e?.message || '音声認識の開始に失敗しました');
      shouldRunRef.current = false;
      setCapturing(false);
      setRecState('stopped');
    }
  }, [
    clearShortPauseTimer,
    dualInstanceEnabled,
    ensureMicrophonePermission,
    setupRecognitionInstance,
    speechLang,
    translationEnabled,
    translationTargets,
    translatorSupported,
    updateStatus,
  ]);

  const stopCapture = useCallback(() => {
    shouldRunRef.current = false;
    clearShortPauseTimer();
    nextInstanceStartedRef.current = false;
    restartInProgressRef.current = false;
    setCapturing(false);
    setRecState('stopped');
    for (const rec of recognitionsRef.current) {
      try {
        rec?.stop?.();
      } catch {
        // ignore
      }
    }
  }, [clearShortPauseTimer]);

  // Persisted ON/OFF state should restore across reload.
  // Note: Some browsers may require user gesture to start; in that case the setting remains ON and user can toggle off/on.
  useEffect(() => {
    if (!speechSupported) return;
    if (enabledSetting && !capturing && recState === 'stopped') {
      void startCapture();
      return;
    }
    if (!enabledSetting && capturing) {
      stopCapture();
    }
  }, [capturing, enabledSetting, recState, speechSupported, startCapture, stopCapture]);

  useEffect(() => {
    const ws = getWebSocketClient();
    ws.connect().catch(() => {
      // ignore
    });
    updateStatus({ wsConnected: ws.isConnected });
    const unsubConnect = ws.onConnect(() => updateStatus({ wsConnected: true }));
    const unsubDisconnect = ws.onDisconnect(() => updateStatus({ wsConnected: false }));
    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, [updateStatus]);

  useEffect(() => {
    const client = new ChromeTranslatorClient({
      onDownloadStatusChange: (status) => setDownloadStatus(status),
    });
    translatorRef.current = client;
    setTranslatorSupported(client.isSupported());
    return () => {
      void client.destroy();
      translatorRef.current = null;
    };
  }, []);

  useEffect(() => {
    recognitionsRef.current.forEach((rec) => {
      try {
        if (rec) rec.lang = speechLang;
      } catch {
        // ignore
      }
    });
  }, [speechLang]);

  useEffect(() => stopCapture, [stopCapture]);

  useEffect(() => {
    updateStatus({
      capturing,
      recState,
      speechSupported,
      speechLang,
      dualInstanceEnabled,
      translationEnabled,
      translationTargets,
      translatorSupported,
      downloadStatus,
      antiSexualEnabled,
      bouyomiEnabled,
      error,
    });
  }, [
    antiSexualEnabled,
    bouyomiEnabled,
    capturing,
    downloadStatus,
    dualInstanceEnabled,
    error,
    recState,
    speechLang,
    speechSupported,
    translationEnabled,
    translationTargets,
    translatorSupported,
    updateStatus,
  ]);

  if (variant === 'switch_only') {
    return (
      <Switch
        aria-label="マイク"
        checked={enabledSetting}
        disabled={!speechSupported && !enabledSetting}
        onCheckedChange={(checked) => {
          onEnabledChange?.(checked);
          // Keep local behavior responsive even before settings round-trip completes.
          if (checked) {
            if (recState === 'stopped' && !capturing) void startCapture();
          } else {
            stopCapture();
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">マイク</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {capturing ? '送信中' : (enabledSetting ? '起動待ち' : '停止中')}
          </div>
        </div>
        <Switch
          checked={enabledSetting}
          disabled={!speechSupported && !enabledSetting}
          onCheckedChange={(checked) => {
            onEnabledChange?.(checked);
            // Parent should persist this into SQLite (overlay settings).
            // We also start/stop locally to make UI responsive even before settings round-trip completes.
            if (checked) {
              if (recState === 'stopped' && !capturing) void startCapture();
            } else {
              stopCapture();
            }
          }}
        />
      </div>

      {!capturing && !speechSupported ? (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          この環境では SpeechRecognition が見つからないだす。Chromeで{' '}
          <span className="font-mono">http://localhost:{webServerPort || 'PORT'}/</span> を開いて操作してくださいだす。
        </div>
      ) : null}
    </div>
  );
};
