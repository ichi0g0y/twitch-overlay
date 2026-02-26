import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { INFINITE_EXPIRY } from './config';
import {
  applyTranslationToLines,
  createTranslationUpdate,
  resolveTranslationTargetId,
  TRANSLATION_WAIT_TIMEOUT_MS,
} from './lineStateUtils';
import type { MicTranscriptPayload, MicTranscriptTranslationPayload, TranscriptLine } from './types';

const INTERIM_CLEAR_DELAY_MS = 1500;

interface UseMicTranscriptLinesOptions {
  enabled: boolean;
  maxLines: number;
  lineTtlMs: number;
  lastTtlMs: number;
  timerMs: number;
  interimMarkerLeft: string;
  interimMarkerRight: string;
}

interface UseMicTranscriptLinesResult {
  visibleLines: TranscriptLine[];
}

export function useMicTranscriptLines({
  enabled,
  maxLines,
  lineTtlMs,
  lastTtlMs,
  timerMs,
  interimMarkerLeft,
  interimMarkerRight,
}: UseMicTranscriptLinesOptions): UseMicTranscriptLinesResult {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimLine, setInterimLine] = useState<TranscriptLine | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const interimClearTimerRef = useRef<number | null>(null);
  const clearAllTimerRef = useRef<number | null>(null);
  const translationWaitTimerRef = useRef<number | null>(null);
  const translationIdAliasRef = useRef<Map<string, { to: string; at: number }>>(new Map());

  const applyExpiryRules = useCallback((nextLines: TranscriptLine[]) => {
    if (nextLines.length === 0) return [];
    const now = Date.now();
    const lastIndex = nextLines.length - 1;
    return nextLines
      .map((line, index) => {
        const receivedTranslations = Object.keys(line.translations || {}).length;
        const expectedTranslations = line.expectedTranslations ?? 0;
        const waitingForTranslations = expectedTranslations > 0 && receivedTranslations < expectedTranslations;
        const baseTtl = index === lastIndex ? lastTtlMs : lineTtlMs;
        const ttl = baseTtl === INFINITE_EXPIRY
          ? INFINITE_EXPIRY
          : Math.max(baseTtl, waitingForTranslations ? TRANSLATION_WAIT_TIMEOUT_MS : 0);
        const createdAt = Number.isFinite(line.createdAt) ? line.createdAt : now;
        const expiresAt = ttl === INFINITE_EXPIRY ? INFINITE_EXPIRY : createdAt + ttl;
        return { ...line, createdAt, expiresAt };
      })
      .filter((line) => line.expiresAt === INFINITE_EXPIRY || (line.expiresAt ?? now) > now);
  }, [lastTtlMs, lineTtlMs]);

  const scheduleExpiryCheck = useCallback((nextLines: TranscriptLine[]) => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (nextLines.length === 0) return;

    const now = Date.now();
    const nextExpiry = nextLines.reduce((min, line) => {
      const expiresAt = line.expiresAt;
      if (expiresAt === undefined || expiresAt === INFINITE_EXPIRY) return min;
      return Math.min(min, expiresAt);
    }, Number.POSITIVE_INFINITY);

    if (!Number.isFinite(nextExpiry)) return;
    expiryTimerRef.current = window.setTimeout(() => {
      setLines((prev) => applyExpiryRules(prev));
    }, Math.max(nextExpiry - now, 0));
  }, [applyExpiryRules]);

  const scheduleInterimClear = useCallback(() => {
    if (interimClearTimerRef.current !== null) {
      window.clearTimeout(interimClearTimerRef.current);
    }
    interimClearTimerRef.current = window.setTimeout(() => setInterimLine(null), INTERIM_CLEAR_DELAY_MS);
  }, []);

  const scheduleClearAll = useCallback(() => {
    if (clearAllTimerRef.current !== null) {
      window.clearTimeout(clearAllTimerRef.current);
      clearAllTimerRef.current = null;
    }

    const delay = Math.max(0, timerMs);
    if (!enabled || delay <= 0) return;
    clearAllTimerRef.current = window.setTimeout(() => {
      setLines([]);
      setInterimLine(null);
    }, delay);
  }, [enabled, timerMs]);

  const cancelTranslationWait = useCallback(() => {
    if (translationWaitTimerRef.current !== null) {
      window.clearTimeout(translationWaitTimerRef.current);
      translationWaitTimerRef.current = null;
    }
  }, []);

  const registerTranslationAlias = useCallback((fromId: string, toId: string) => {
    const from = (fromId || '').trim();
    const to = (toId || '').trim();
    if (!from || !to || from === to) return;
    translationIdAliasRef.current.set(from, { to, at: Date.now() });
  }, []);

  const pushFinalLine = useCallback((payload: MicTranscriptPayload) => {
    const text = (payload?.text || '').trim();
    if (!text) return;

    const id = payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const expected = payload.expected_translations ?? 0;

    setInterimLine(null);
    setLines((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last.text === text || text.startsWith(last.text) || last.text.startsWith(text)) {
          registerTranslationAlias(last.id, id);
          const next = [...prev];
          next[next.length - 1] = { ...last, id, text, createdAt: now, expectedTranslations: expected };
          return applyExpiryRules(next);
        }
      }

      const merged = [...prev, { id, text, createdAt: now, expectedTranslations: expected }];
      const trimmed = maxLines > 0 ? merged.slice(-maxLines) : [];
      return applyExpiryRules(trimmed);
    });

    cancelTranslationWait();
    if (expected > 0) {
      translationWaitTimerRef.current = window.setTimeout(scheduleClearAll, TRANSLATION_WAIT_TIMEOUT_MS);
      return;
    }
    scheduleClearAll();
  }, [applyExpiryRules, cancelTranslationWait, maxLines, registerTranslationAlias, scheduleClearAll]);

  const pushInterimLine = useCallback((payload: MicTranscriptPayload) => {
    const text = (payload?.text || '').trim();
    if (!text) return;

    const id = payload.id || 'interim';
    const now = Date.now();
    setInterimLine((prev) => (prev?.text === text ? prev : { id, text, createdAt: now }));
    scheduleInterimClear();
    scheduleClearAll();
  }, [scheduleClearAll, scheduleInterimClear]);

  const applyTranslation = useCallback((payload: MicTranscriptTranslationPayload) => {
    const id = resolveTranslationTargetId(payload?.id || '', translationIdAliasRef.current);
    const update = createTranslationUpdate(payload, id);
    if (!update) return;

    let allTranslationsReceived = false;
    setLines((prev) => {
      const result = applyTranslationToLines(prev, update);
      allTranslationsReceived = result.allTranslationsReceived;
      return result.nextLines;
    });

    if (allTranslationsReceived) {
      cancelTranslationWait();
      scheduleClearAll();
    }
  }, [cancelTranslationWait, scheduleClearAll]);

  useEffect(() => () => {
    if (expiryTimerRef.current !== null) window.clearTimeout(expiryTimerRef.current);
    if (interimClearTimerRef.current !== null) window.clearTimeout(interimClearTimerRef.current);
    if (clearAllTimerRef.current !== null) window.clearTimeout(clearAllTimerRef.current);
    if (translationWaitTimerRef.current !== null) window.clearTimeout(translationWaitTimerRef.current);
    translationIdAliasRef.current.clear();
  }, []);

  useEffect(() => {
    if (maxLines <= 0) {
      setLines([]);
      return;
    }
    setLines((prev) => prev.slice(-maxLines));
  }, [maxLines]);

  useEffect(() => { setLines((prev) => applyExpiryRules(prev)); }, [applyExpiryRules]);
  useEffect(() => { scheduleExpiryCheck(lines); }, [lines, scheduleExpiryCheck]);
  useEffect(() => { scheduleClearAll(); }, [scheduleClearAll]);

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
      if (clearAllTimerRef.current !== null) {
        window.clearTimeout(clearAllTimerRef.current);
        clearAllTimerRef.current = null;
      }
      if (translationWaitTimerRef.current !== null) {
        window.clearTimeout(translationWaitTimerRef.current);
        translationWaitTimerRef.current = null;
      }
      translationIdAliasRef.current.clear();
      setLines([]);
      setInterimLine(null);
    }
  }, [enabled]);

  useWebSocket({
    onMessage: (message) => {
      if (message.type === 'mic_transcript') {
        const payload = message.data as MicTranscriptPayload;
        if (payload?.is_interim) pushInterimLine(payload);
        else pushFinalLine(payload);
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
    const base = lines.filter((line) => line.text && (line.expiresAt ?? now) > now);
    if (!interimLine?.text) return base.slice(-maxLines);

    const keep = Math.max(maxLines - 1, 0);
    const trimmed = keep > 0 ? base.slice(-keep) : [];
    const marked = `${interimMarkerLeft ?? ''}${interimLine.text}${interimMarkerRight ?? ''}`;
    return [...trimmed, { ...interimLine, text: marked, isInterim: true }];
  }, [interimLine, interimMarkerLeft, interimMarkerRight, lines, maxLines]);

  return { visibleLines };
}
