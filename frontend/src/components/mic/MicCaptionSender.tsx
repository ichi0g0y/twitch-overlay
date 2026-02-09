import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OverlaySettings } from '../../contexts/SettingsContext';
import { ChromeTranslatorClient, type ChromeTranslationDownloadStatus } from '../../utils/chromeTranslator';
import { getWebSocketClient } from '../../utils/websocket';
import { Button } from '../ui/button';

type RecState = 'stopped' | 'starting' | 'running';

function nowID(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeLang(code: string | undefined | null, fallback: string): string {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  if (raw === 'zh-Hant') return raw;
  const lower = raw.toLowerCase();
  return lower.split(/[-_]/)[0] || fallback;
}

export const MicCaptionSender: React.FC<{ overlaySettings: OverlaySettings | null }> = ({ overlaySettings }) => {
  const speechLang = useMemo(
    () => normalizeLang(overlaySettings?.mic_transcript_speech_language, 'ja'),
    [overlaySettings?.mic_transcript_speech_language],
  );
  const shortPauseMs = overlaySettings?.mic_transcript_speech_short_pause_ms ?? 800;
  const interimThrottleMs = overlaySettings?.mic_transcript_speech_interim_throttle_ms ?? 200;
  const dualInstanceEnabled = overlaySettings?.mic_transcript_speech_dual_instance_enabled ?? true;
  const restartDelayMs = overlaySettings?.mic_transcript_speech_restart_delay_ms ?? 100;

  const translationMode = overlaySettings?.mic_transcript_translation_mode
    ?? ((overlaySettings?.mic_transcript_translation_enabled ?? false) ? 'chrome' : 'off');
  const translationEnabled = translationMode !== 'off';
  const translationTargetLang = useMemo(
    () => (overlaySettings?.mic_transcript_translation_language || 'en').trim() || 'en',
    [overlaySettings?.mic_transcript_translation_language],
  );

  const [wsConnected, setWsConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recState, setRecState] = useState<RecState>('stopped');
  const [lastInterim, setLastInterim] = useState('');
  const [lastFinal, setLastFinal] = useState('');
  const [lastTranslation, setLastTranslation] = useState('');
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

      const ws = getWebSocketClient();
      ws.send('mic_transcript', {
        id: 'interim',
        text,
        is_interim: true,
        timestamp_ms: now,
        source: 'web_speech',
        language: speechLang,
      });
    },
    [interimThrottleMs, speechLang],
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

      ws.send('mic_transcript', {
        id,
        text: trimmed,
        is_interim: false,
        timestamp_ms: ts,
        source: 'web_speech',
        language: speechLang,
      });

      if (!translationEnabled) return;
      if (!translatorSupported) return;
      const translator = translatorRef.current;
      if (!translator) return;
      try {
        const res = await translator.translate(trimmed, speechLang, translationTargetLang);
        const translated = (res.translatedText || '').trim();
        if (!translated) return;
        ws.send('mic_transcript_translation', {
          id,
          translation: translated,
          source_language: res.sourceLanguage || speechLang,
          target_language: res.targetLanguage,
        });
        setLastTranslation(translated);
      } catch (e: any) {
        setError(e?.message || '翻訳に失敗しました');
      }
    },
    [speechLang, translationEnabled, translationTargetLang, translatorSupported],
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
          setLastInterim(combined);
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
          setLastInterim('');
          setLastFinal(finalText);
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
        setError(event?.error || event?.message || '音声認識エラー');
        scheduleRestart('error');
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
    setLastInterim('');
    setLastFinal('');
    setLastTranslation('');

    const ws = getWebSocketClient();
    if (!ws.isConnected) {
      try {
        await ws.connect();
      } catch {
        // ignore
      }
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError('SpeechRecognition が利用できません（Chrome推奨）');
      return;
    }

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
    } catch (e: any) {
      setError(e?.message || '音声認識の開始に失敗しました');
      shouldRunRef.current = false;
      setCapturing(false);
      setRecState('stopped');
    }
  }, [clearShortPauseTimer, dualInstanceEnabled, ensureMicrophonePermission, setupRecognitionInstance]);

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

  const handlePreloadModel = useCallback(async () => {
    if (!translatorRef.current) return;
    setError(null);
    try {
      await translatorRef.current.preload(speechLang, translationTargetLang);
    } catch (e: any) {
      setError(e?.message || '翻訳モデルの準備に失敗しました');
    }
  }, [speechLang, translationTargetLang]);

  useEffect(() => {
    const ws = getWebSocketClient();
    ws.connect().catch(() => {
      // ignore
    });
    setWsConnected(ws.isConnected);
    const unsubConnect = ws.onConnect(() => setWsConnected(true));
    const unsubDisconnect = ws.onDisconnect(() => setWsConnected(false));
    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/40 dark:bg-gray-800/30 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">WebSocket</div>
          <div className="mt-1 font-semibold">
            {wsConnected ? <span className="text-emerald-600 dark:text-emerald-400">接続中</span> : <span className="text-amber-600 dark:text-amber-400">未接続</span>}
          </div>
        </div>
        <div className="rounded border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/40 dark:bg-gray-800/30 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">音声認識</div>
          <div className="mt-1 font-semibold">
            {recState === 'running' ? '実行中' : recState === 'starting' ? '起動中' : '停止'}
            <span className="ml-2 text-xs font-mono text-gray-500 dark:text-gray-400">
              lang={speechLang} {dualInstanceEnabled ? 'dual' : 'single'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={capturing ? 'secondary' : 'default'}
          onClick={capturing ? stopCapture : () => void startCapture()}
        >
          {capturing ? '停止' : '開始'}
        </Button>

        <div className="text-sm text-gray-600 dark:text-gray-300">
          翻訳: <span className="font-mono">{translationEnabled ? `on (${translationTargetLang})` : 'off'}</span>
          {!translatorSupported && translationEnabled ? (
            <span className="ml-2 text-amber-600 dark:text-amber-400">Translator API非対応（Chrome 138+）</span>
          ) : null}
        </div>

        {translationEnabled && translatorSupported ? (
          <Button type="button" variant="outline" onClick={() => void handlePreloadModel()}>
            翻訳モデル準備
          </Button>
        ) : null}
      </div>

      {downloadStatus ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <div>
            {downloadStatus.message || `download: ${downloadStatus.status} (${downloadStatus.sourceLang}→${downloadStatus.targetLang})`}
          </div>
          {typeof downloadStatus.progress === 'number' ? (
            <div className="mt-2 h-2 rounded bg-gray-200/70 dark:bg-gray-700/70 overflow-hidden">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${Math.min(100, Math.max(0, downloadStatus.progress))}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-gray-200/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/20 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">interim</div>
          <div className="break-words">{lastInterim || <span className="text-gray-400">（なし）</span>}</div>
        </div>
        <div className="rounded border border-gray-200/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/20 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">final</div>
          <div className="break-words">{lastFinal || <span className="text-gray-400">（なし）</span>}</div>
        </div>
        <div className="rounded border border-gray-200/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/20 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">translation</div>
          <div className="break-words">{lastTranslation || <span className="text-gray-400">（なし）</span>}</div>
        </div>
      </div>
    </div>
  );
};

