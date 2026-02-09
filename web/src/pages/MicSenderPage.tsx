import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { ChromeTranslatorClient, type ChromeTranslationDownloadStatus } from '../utils/chromeTranslator';

type RecState = 'stopped' | 'starting' | 'running';

function nowID(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeLang(code: string | undefined | null, fallback: string): string {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  // keep zh-Hant as-is; otherwise lower-case and take primary subtag.
  if (raw === 'zh-Hant') return raw;
  const lower = raw.toLowerCase();
  return lower.split(/[-_]/)[0] || fallback;
}

export const MicSenderPage: React.FC = () => {
  const { settings } = useSettings();
  const { isConnected, send } = useWebSocket();

  const speechLang = useMemo(
    () => normalizeLang(settings?.mic_transcript_speech_language, 'ja'),
    [settings?.mic_transcript_speech_language]
  );
  const shortPauseMs = settings?.mic_transcript_speech_short_pause_ms ?? 800;
  const interimThrottleMs = settings?.mic_transcript_speech_interim_throttle_ms ?? 200;
  const dualInstanceEnabled = settings?.mic_transcript_speech_dual_instance_enabled ?? true;
  const restartDelayMs = settings?.mic_transcript_speech_restart_delay_ms ?? 100;

  const translationMode = settings?.mic_transcript_translation_mode ?? 'off';
  const translationEnabled = translationMode !== 'off';
  const translationTargetLang = useMemo(
    () => (settings?.mic_transcript_translation_language || 'en').trim() || 'en',
    [settings?.mic_transcript_translation_language]
  );

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

  const getActiveRecognition = useCallback(() => {
    return recognitionsRef.current[activeIndexRef.current];
  }, []);

  const switchToNextInstance = useCallback(() => {
    clearShortPauseTimer();
    const prev = activeIndexRef.current;
    activeIndexRef.current = (activeIndexRef.current + 1) % 2;
    nextInstanceStartedRef.current = false;
    recognitionStatesRef.current[prev] = recognitionStatesRef.current[prev] || 'stopped';
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
    [getActiveRecognition, restartDelayMs]
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
    [clearShortPauseTimer, dualInstanceEnabled]
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
      send('mic_transcript', {
        id: 'interim',
        text,
        is_interim: true,
        timestamp_ms: now,
        source: 'web_speech',
        language: speechLang,
      });
    },
    [interimThrottleMs, send, speechLang]
  );

  const sendFinal = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (lastFinalSentRef.current === trimmed) return;
      lastFinalSentRef.current = trimmed;

      const id = nowID('mic');
      const ts = Date.now();

      send('mic_transcript', {
        id,
        text: trimmed,
        is_interim: false,
        timestamp_ms: ts,
        source: 'web_speech',
        language: speechLang,
      });

      if (!translationEnabled) return;
      const translator = translatorRef.current;
      if (!translator) return;
      try {
        const res = await translator.translate(trimmed, speechLang, translationTargetLang);
        const translated = (res.translatedText || '').trim();
        if (!translated) return;
        send('mic_transcript_translation', {
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
    [send, speechLang, translationEnabled, translationTargetLang]
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
    ]
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

        // If the active instance ended and the next one is already running/starting, switch.
        if (dualInstanceEnabled && index === activeIndexRef.current) {
          const nextIndex = (activeIndexRef.current + 1) % 2;
          const nextState = recognitionStatesRef.current[nextIndex];
          if (nextState === 'running' || nextState === 'starting') {
            switchToNextInstance();
            setRecState(nextState);
            return;
          }
        }

        // Otherwise restart the active one.
        if (index === activeIndexRef.current) {
          scheduleRestart('end');
        }
      };

      rec.onresult = createOnResultHandler(index);
    },
    [createOnResultHandler, dualInstanceEnabled, scheduleRestart, speechLang, switchToNextInstance]
  );

  const startCapture = useCallback(() => {
    setError(null);
    clearShortPauseTimer();
    lastFinalSentRef.current = '';
    lastInterimSentAtRef.current = 0;
    setLastInterim('');
    setLastFinal('');
    setLastTranslation('');

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError('SpeechRecognition が利用できません（Chrome推奨）');
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
  }, [clearShortPauseTimer, dualInstanceEnabled, setupRecognitionInstance]);

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

  // Apply language changes to running instances.
  useEffect(() => {
    recognitionsRef.current.forEach((rec) => {
      try {
        if (rec) rec.lang = speechLang;
      } catch {
        // ignore
      }
    });
  }, [speechLang]);

  const overlayUrls = useMemo(() => {
    const base = `${window.location.protocol}//${window.location.host}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
    return {
      sender: `${base}/mic`,
      overlay: `${base}/`,
    };
  }, []);

  const handlePreloadModel = useCallback(async () => {
    if (!translatorRef.current) return;
    setError(null);
    try {
      await translatorRef.current.preload(speechLang, translationTargetLang);
    } catch (e: any) {
      setError(e?.message || '翻訳モデルの準備に失敗しました');
    }
  }, [speechLang, translationTargetLang]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">字幕送信（Web Speech + Chrome翻訳）</h1>
          <p className="text-sm text-zinc-300">
            このページはマイクを使って音声認識し、必要なら翻訳して <code className="px-1 py-0.5 rounded bg-white/10">/overlay</code> に送信します。
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="text-sm text-zinc-300">WebSocket</div>
            <div className="flex items-center justify-between">
              <div className={`text-lg font-semibold ${isConnected ? 'text-emerald-300' : 'text-amber-300'}`}>
                {isConnected ? '接続中' : '未接続'}
              </div>
              <div className="text-xs text-zinc-400">{overlayUrls.sender}</div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="text-sm text-zinc-300">音声認識</div>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {recState === 'running' ? '実行中' : recState === 'starting' ? '起動中' : '停止'}
              </div>
              <div className="text-xs text-zinc-400">
                lang=<span className="font-mono">{speechLang}</span>{' '}
                {dualInstanceEnabled ? '(dual)' : '(single)'}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`px-4 py-2 rounded font-semibold ${
                capturing ? 'bg-zinc-700 text-zinc-200' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
              onClick={capturing ? stopCapture : startCapture}
            >
              {capturing ? '停止' : '開始'}
            </button>

            <div className="text-sm text-zinc-300">
              翻訳: <span className="font-mono">{translationEnabled ? `on (${translationTargetLang})` : 'off'}</span>
              {!translatorSupported && translationEnabled ? (
                <span className="ml-2 text-amber-300">Translator API非対応（Chrome 138+）</span>
              ) : null}
            </div>

            {translationEnabled && translatorSupported ? (
              <button
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/15 text-sm"
                onClick={handlePreloadModel}
              >
                翻訳モデル準備
              </button>
            ) : null}
          </div>

          {downloadStatus ? (
            <div className="text-sm text-zinc-300">
              <div>
                {downloadStatus.message || `download: ${downloadStatus.status} (${downloadStatus.sourceLang}→${downloadStatus.targetLang})`}
              </div>
              {typeof downloadStatus.progress === 'number' ? (
                <div className="mt-2 h-2 rounded bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-sky-500"
                    style={{ width: `${Math.min(100, Math.max(0, downloadStatus.progress))}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded bg-red-500/20 border border-red-400/30 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="text-sm text-zinc-300">プレビュー（このページ用）</div>
          <div className="space-y-2">
            <div className="rounded bg-black/30 border border-white/10 px-3 py-2">
              <div className="text-xs text-zinc-400 mb-1">interim</div>
              <div className="text-base">{lastInterim || <span className="text-zinc-500">（なし）</span>}</div>
            </div>
            <div className="rounded bg-black/30 border border-white/10 px-3 py-2">
              <div className="text-xs text-zinc-400 mb-1">final</div>
              <div className="text-base">{lastFinal || <span className="text-zinc-500">（なし）</span>}</div>
            </div>
            <div className="rounded bg-black/30 border border-white/10 px-3 py-2">
              <div className="text-xs text-zinc-400 mb-1">translation</div>
              <div className="text-base">{lastTranslation || <span className="text-zinc-500">（なし）</span>}</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2 text-sm text-zinc-300">
          <div className="font-semibold">URL</div>
          <div className="font-mono break-all">
            送信: {overlayUrls.sender}
          </div>
          <div className="font-mono break-all">
            表示: {overlayUrls.overlay}
          </div>
        </section>
      </div>
    </div>
  );
};
