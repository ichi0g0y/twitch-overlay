import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useWebSocket } from '../hooks/useWebSocket';

interface MicTranscriptPayload {
  id?: string;
  text?: string;
  is_interim?: boolean;
  timestamp_ms?: number;
}

interface MicTranscriptTranslationPayload {
  id?: string;
  translation?: string;
  target_language?: string;
  source_language?: string;
}

const POSITION_CLASS: Record<string, string> = {
  'bottom-left': 'bottom-6 left-6 items-start text-left',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 items-center text-center',
  'bottom-right': 'bottom-6 right-6 items-end text-right',
  'top-left': 'top-6 left-6 items-start text-left',
  'top-center': 'top-6 left-1/2 -translate-x-1/2 items-center text-center',
  'top-right': 'top-6 right-6 items-end text-right',
};

const FINAL_LINE_TTL_MS = 8000;
const INTERIM_CLEAR_DELAY_MS = 1500;

type TranscriptLine = {
  id: string;
  text: string;
  isInterim?: boolean;
  expiresAt?: number;
  translation?: string;
  targetLanguage?: string;
  sourceLanguage?: string;
};

export const MicTranscriptOverlay: React.FC = () => {
  const { settings } = useSettings();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimLine, setInterimLine] = useState<TranscriptLine | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const interimClearTimerRef = useRef<number | null>(null);
  const maxLines = settings?.mic_transcript_max_lines ?? 3;
  const enabled = settings?.mic_transcript_enabled ?? false;
  const translationEnabled = settings?.mic_transcript_translation_enabled ?? false;
  const position = settings?.mic_transcript_position || 'bottom-left';
  const fontSize = settings?.mic_transcript_font_size ?? 20;
  const translationFontSize = settings?.mic_transcript_translation_font_size ?? Math.max(fontSize - 6, 12);
  const positionClass = POSITION_CLASS[position] || POSITION_CLASS['bottom-left'];

  const scheduleExpiryCheck = useCallback((nextLines: TranscriptLine[]) => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (nextLines.length === 0) {
      return;
    }
    const now = Date.now();
    const nextExpiry = nextLines.reduce((min, line) => {
      const expiresAt = (line as TranscriptLine & { expiresAt?: number }).expiresAt ?? now;
      return Math.min(min, expiresAt);
    }, Number.POSITIVE_INFINITY);
    const delay = Math.max(nextExpiry - now, 0);
    expiryTimerRef.current = window.setTimeout(() => {
      setLines((prev) => {
        const nowInner = Date.now();
        return prev.filter((line) => ((line as TranscriptLine & { expiresAt?: number }).expiresAt ?? nowInner) > nowInner);
      });
    }, delay);
  }, []);

  const scheduleInterimClear = useCallback(() => {
    if (interimClearTimerRef.current !== null) {
      window.clearTimeout(interimClearTimerRef.current);
    }
    interimClearTimerRef.current = window.setTimeout(() => {
      setInterimLine(null);
    }, INTERIM_CLEAR_DELAY_MS);
  }, []);

  const pushFinalLine = useCallback(
    (payload: MicTranscriptPayload) => {
      const text = (payload?.text || '').trim();
      if (!text) return;
      const id = payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const expiresAt = Date.now() + FINAL_LINE_TTL_MS;

      setInterimLine(null);
      setLines((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.text === text) {
            const next = [...prev];
            next[next.length - 1] = { ...last, id, text, expiresAt };
            return next;
          }
          if (text.startsWith(last.text) || last.text.startsWith(text)) {
            const next = [...prev];
            next[next.length - 1] = { id, text, expiresAt };
            return next;
          }
        }
        return [...prev, { id, text, expiresAt }].slice(-maxLines);
      });
    },
    [maxLines]
  );

  const pushInterimLine = useCallback(
    (payload: MicTranscriptPayload) => {
      const text = (payload?.text || '').trim();
      if (!text) return;
      const id = payload.id || 'interim';

      setInterimLine((prev) => {
        if (prev?.text === text) {
          return prev;
        }
        return { id, text };
      });
      scheduleInterimClear();
    },
    [scheduleInterimClear]
  );

  const applyTranslation = useCallback((payload: MicTranscriptTranslationPayload) => {
    const id = payload?.id;
    const translation = (payload?.translation || '').trim();
    if (!id || !translation) return;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return {
          ...line,
          translation,
          targetLanguage: payload?.target_language,
          sourceLanguage: payload?.source_language,
        };
      })
    );
  }, []);

  useEffect(() => {
    return () => {
      if (expiryTimerRef.current !== null) {
        window.clearTimeout(expiryTimerRef.current);
      }
      if (interimClearTimerRef.current !== null) {
        window.clearTimeout(interimClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (maxLines <= 0) {
      setLines([]);
      return;
    }
    setLines((prev) => prev.slice(-maxLines));
  }, [maxLines]);

  useEffect(() => {
    scheduleExpiryCheck(lines);
  }, [lines, scheduleExpiryCheck]);

  useEffect(() => {
    if (!enabled) {
      if (expiryTimerRef.current !== null) {
        window.clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      if (interimClearTimerRef.current !== null) {
        window.clearTimeout(interimClearTimerRef.current);
        interimClearTimerRef.current = null;
      }
      setLines([]);
      setInterimLine(null);
    }
  }, [enabled]);

  useWebSocket({
    onMessage: (message) => {
      if (message.type === 'mic_transcript') {
        const payload = message.data as MicTranscriptPayload;
        if (payload?.is_interim) {
          pushInterimLine(payload);
        } else {
          pushFinalLine(payload);
        }
        return;
      }
      if (message.type === 'mic_transcript_translation') {
        applyTranslation(message.data as MicTranscriptTranslationPayload);
      }
    },
  });

  const visibleLines = useMemo(() => {
    if (maxLines <= 0) return [];
    const now = Date.now();
    const base = lines.filter((line) => {
      if (!line.text) return false;
      const expiresAt = (line as TranscriptLine & { expiresAt?: number }).expiresAt ?? now;
      return expiresAt > now;
    });
    if (!interimLine || !interimLine.text) {
      return base.slice(-maxLines);
    }
    const keep = Math.max(maxLines - 1, 0);
    const trimmed = keep > 0 ? base.slice(-keep) : [];
    return [...trimmed, { ...interimLine, text: `〜${interimLine.text}〜`, isInterim: true }];
  }, [lines, interimLine, maxLines]);

  if (!enabled || visibleLines.length === 0) {
    return null;
  }

  return (
    <div
      className={`fixed z-[20] flex flex-col gap-2 pointer-events-none font-readable ${positionClass}`}
      style={{ fontSize: `${fontSize}px` }}
    >
      {visibleLines.map((line) => (
        <div
          key={line.id}
          className={`px-3 py-2 rounded bg-black/60 text-white text-outline ${
            line.isInterim ? 'opacity-80' : ''
          }`}
        >
          <div className="leading-snug">{line.text}</div>
          {translationEnabled &&
            line.translation &&
            line.translation !== line.text && (
              <div
                className="mt-1 opacity-90 leading-snug"
                style={{ fontSize: `${translationFontSize}px` }}
              >
                {line.translation}
              </div>
            )}
        </div>
      ))}
    </div>
  );
};
