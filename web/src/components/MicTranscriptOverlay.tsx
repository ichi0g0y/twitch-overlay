import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { renderOutlinedText, renderTranslationEntries, type TranslationEntry, type TranslationSlotStyle } from './MicTranscriptRenderer';

interface MicTranscriptPayload {
  id?: string;
  text?: string;
  is_interim?: boolean;
  timestamp_ms?: number;
  expected_translations?: number;
}

interface MicTranscriptTranslationPayload {
  id?: string;
  translation?: string;
  target_language?: string;
  source_language?: string;
}

const POSITION_CLASS: Record<string, string> = {
  'bottom-left': 'bottom-6 left-6 items-start',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-6 right-6 items-end',
  'top-left': 'top-6 left-6 items-start',
  'top-center': 'top-6 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-6 right-6 items-end',
};

const DEFAULT_LINE_TTL_MS = 8000;
const DEFAULT_LAST_TTL_MS = 8000;
const INTERIM_CLEAR_DELAY_MS = 1500;
const TRANSLATION_WAIT_TIMEOUT_MS = 5000;
const INFINITE_EXPIRY = Number.POSITIVE_INFINITY;

function normalizeLang(code: string | undefined | null): string {
  const raw = (code || '').trim();
  if (!raw) return '';
  if (raw === 'zh-Hant') return raw;
  const normalized = raw.toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('zh-') && normalized.includes('hant')) return 'zh-Hant';
  const base = normalized.split('-')[0] || '';
  if (base === 'zh') return 'zh';
  return base;
}

function resolveTranslationMode(
  mode: string | undefined | null,
  legacyEnabled: boolean | undefined,
): 'off' | 'chrome' {
  const raw = (mode || '').trim();
  if (raw === 'chrome') return 'chrome';
  if (raw === 'off') return 'off';
  return legacyEnabled ? 'chrome' : 'off';
}

type TranscriptLine = {
  id: string;
  text: string;
  isInterim?: boolean;
  createdAt: number;
  expiresAt?: number;
  expectedTranslations?: number;
  translations?: Record<string, { text: string; targetLanguage?: string; sourceLanguage?: string }>;
};

export const MicTranscriptOverlay: React.FC = () => {
  const { settings } = useSettings();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimLine, setInterimLine] = useState<TranscriptLine | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const interimClearTimerRef = useRef<number | null>(null);
  const clearAllTimerRef = useRef<number | null>(null);
  const translationWaitTimerRef = useRef<number | null>(null);

  const maxLines = settings?.mic_transcript_max_lines ?? 3;
  const enabled = settings?.mic_transcript_enabled ?? false;
  const translationMode = resolveTranslationMode(
    settings?.mic_transcript_translation_mode,
    settings?.mic_transcript_translation_enabled,
  );
  const translationEnabled = translationMode !== 'off';
  const position = settings?.mic_transcript_position || 'bottom-left';
  const vAlign = (settings?.mic_transcript_v_align || '').trim() || 'bottom';
  const frameHeightPx = settings?.mic_transcript_frame_height_px ?? 0;
  const fontSize = settings?.mic_transcript_font_size ?? 20;
  const translationFontSize = settings?.mic_transcript_translation_font_size ?? Math.max(fontSize - 6, 12);
  const maxWidthPx = settings?.mic_transcript_max_width_px ?? 0;
  const translationPosition = settings?.mic_transcript_translation_position || position;
  const translationMaxWidthPx = maxWidthPx;
  const textAlignSetting = (settings?.mic_transcript_text_align || '').trim();
  const whiteSpaceSetting = (settings?.mic_transcript_white_space || '').trim();
  const backgroundColor = (settings?.mic_transcript_background_color || '').trim() || 'transparent';
  const timerMs = settings?.mic_transcript_timer_ms ?? 0;
  const interimMarkerLeft = settings?.mic_transcript_interim_marker_left ?? ' << ';
  const interimMarkerRight = settings?.mic_transcript_interim_marker_right ?? ' >>';
  const lineSpacing1Px = settings?.mic_transcript_line_spacing_1_px ?? 0;
  const lineSpacing2Px = settings?.mic_transcript_line_spacing_2_px ?? 0;
  const lineSpacing3Px = settings?.mic_transcript_line_spacing_3_px ?? 0;

  const speechTextColor = settings?.mic_transcript_text_color ?? '#ffffff';
  const speechStrokeColor = settings?.mic_transcript_stroke_color ?? '#000000';
  const speechStrokeWidthPx = settings?.mic_transcript_stroke_width_px ?? 6;
  const speechFontWeight = settings?.mic_transcript_font_weight ?? 900;
  const speechFontFamily = settings?.mic_transcript_font_family ?? 'Noto Sans JP';

  const transTextColor = settings?.mic_transcript_translation_text_color ?? '#ffffff';
  const transStrokeColor = settings?.mic_transcript_translation_stroke_color ?? '#000000';
  const transStrokeWidthPx = settings?.mic_transcript_translation_stroke_width_px ?? 6;
  const transFontWeight = settings?.mic_transcript_translation_font_weight ?? 900;
  const transFontFamily = settings?.mic_transcript_translation_font_family ?? 'Noto Sans JP';

  const trans2FontSize = settings?.mic_transcript_translation2_font_size ?? translationFontSize;
  const trans2TextColor = settings?.mic_transcript_translation2_text_color ?? transTextColor;
  const trans2StrokeColor = settings?.mic_transcript_translation2_stroke_color ?? transStrokeColor;
  const trans2StrokeWidthPx = settings?.mic_transcript_translation2_stroke_width_px ?? transStrokeWidthPx;
  const trans2FontWeight = settings?.mic_transcript_translation2_font_weight ?? transFontWeight;
  const trans2FontFamily = settings?.mic_transcript_translation2_font_family ?? transFontFamily;

  const trans3FontSize = settings?.mic_transcript_translation3_font_size ?? translationFontSize;
  const trans3TextColor = settings?.mic_transcript_translation3_text_color ?? transTextColor;
  const trans3StrokeColor = settings?.mic_transcript_translation3_stroke_color ?? transStrokeColor;
  const trans3StrokeWidthPx = settings?.mic_transcript_translation3_stroke_width_px ?? transStrokeWidthPx;
  const trans3FontWeight = settings?.mic_transcript_translation3_font_weight ?? transFontWeight;
  const trans3FontFamily = settings?.mic_transcript_translation3_font_family ?? transFontFamily;

  const lineTtlMs = Math.max(1, settings?.mic_transcript_line_ttl_seconds ?? DEFAULT_LINE_TTL_MS / 1000) * 1000;
  const lastTtlSeconds = settings?.mic_transcript_last_ttl_seconds ?? DEFAULT_LAST_TTL_MS / 1000;
  const lastTtlMs = lastTtlSeconds <= 0 ? INFINITE_EXPIRY : Math.max(1, lastTtlSeconds) * 1000;

  const positionClass = POSITION_CLASS[position] || POSITION_CLASS['bottom-left'];
  const translationPositionClass = POSITION_CLASS[translationPosition] || POSITION_CLASS['bottom-left'];
  const verticalJustifyClass = vAlign === 'top' ? 'justify-start' : 'justify-end';
  const stackedTranslation = translationEnabled && translationPosition === position;
  const effectiveWhiteSpace = whiteSpaceSetting || undefined;

  const translationSlots = useMemo(
    () => {
      const primary = normalizeLang(settings?.mic_transcript_translation_language);
      const fallbackPrimary = translationEnabled ? (primary || 'en') : primary;
      return [
        fallbackPrimary,
        normalizeLang(settings?.mic_transcript_translation2_language),
        normalizeLang(settings?.mic_transcript_translation3_language),
      ];
    },
    [
      settings?.mic_transcript_translation_language,
      settings?.mic_transcript_translation2_language,
      settings?.mic_transcript_translation3_language,
      translationEnabled,
    ],
  );

  const slotStyles: TranslationSlotStyle[] = useMemo(() => [
    { fontSize: translationFontSize, fontWeight: transFontWeight, fontFamily: transFontFamily, textColor: transTextColor, strokeColor: transStrokeColor, strokeWidthPx: transStrokeWidthPx },
    { fontSize: trans2FontSize, fontWeight: trans2FontWeight, fontFamily: trans2FontFamily, textColor: trans2TextColor, strokeColor: trans2StrokeColor, strokeWidthPx: trans2StrokeWidthPx },
    { fontSize: trans3FontSize, fontWeight: trans3FontWeight, fontFamily: trans3FontFamily, textColor: trans3TextColor, strokeColor: trans3StrokeColor, strokeWidthPx: trans3StrokeWidthPx },
  ], [translationFontSize, transFontWeight, transFontFamily, transTextColor, transStrokeColor, transStrokeWidthPx, trans2FontSize, trans2FontWeight, trans2FontFamily, trans2TextColor, trans2StrokeColor, trans2StrokeWidthPx, trans3FontSize, trans3FontWeight, trans3FontFamily, trans3TextColor, trans3StrokeColor, trans3StrokeWidthPx]);


  const derivedTextAlign = useMemo(() => {
    if (textAlignSetting) return textAlignSetting;
    if (position.includes('left')) return 'left';
    if (position.includes('right')) return 'right';
    return 'center';
  }, [position, textAlignSetting]);

  const baseMaxWidth = useMemo(() => {
    if (stackedTranslation) {
      const a = maxWidthPx > 0 ? maxWidthPx : 0;
      const b = translationMaxWidthPx > 0 ? translationMaxWidthPx : 0;
      const effective = a || b;
      return effective > 0 ? effective : 0;
    }
    return maxWidthPx;
  }, [maxWidthPx, stackedTranslation, translationMaxWidthPx]);

  const applyExpiryRules = useCallback((nextLines: TranscriptLine[]) => {
    if (nextLines.length === 0) return [];
    const now = Date.now();
    const lastIndex = nextLines.length - 1;
    return nextLines
      .map((line, index) => {
        const ttl = index === lastIndex ? lastTtlMs : lineTtlMs;
        const createdAt = Number.isFinite(line.createdAt) ? line.createdAt : now;
        const expiresAt = ttl === INFINITE_EXPIRY ? INFINITE_EXPIRY : createdAt + ttl;
        return { ...line, createdAt, expiresAt };
      })
      .filter((line) => line.expiresAt === INFINITE_EXPIRY || (line.expiresAt ?? now) > now);
  }, [lastTtlMs, lineTtlMs]);

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
    if (interimClearTimerRef.current !== null) window.clearTimeout(interimClearTimerRef.current);
    interimClearTimerRef.current = window.setTimeout(() => setInterimLine(null), INTERIM_CLEAR_DELAY_MS);
  }, []);

  const pushFinalLine = useCallback(
    (payload: MicTranscriptPayload) => {
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
            const next = [...prev];
            next[next.length - 1] = { ...last, id, text, createdAt: now, expectedTranslations: expected };
            return applyExpiryRules(next);
          }
        }
        return applyExpiryRules([...prev, { id, text, createdAt: now, expectedTranslations: expected }].slice(-maxLines));
      });

      cancelTranslationWait();
      if (expected > 0) {
        translationWaitTimerRef.current = window.setTimeout(() => {
          scheduleClearAll();
        }, TRANSLATION_WAIT_TIMEOUT_MS);
      } else {
        scheduleClearAll();
      }
    },
    [applyExpiryRules, cancelTranslationWait, maxLines, scheduleClearAll],
  );

  const pushInterimLine = useCallback(
    (payload: MicTranscriptPayload) => {
      const text = (payload?.text || '').trim();
      if (!text) return;
      const id = payload.id || 'interim';
      const now = Date.now();
      setInterimLine((prev) => (prev?.text === text ? prev : { id, text, createdAt: now }));
      scheduleInterimClear();
      scheduleClearAll();
    },
    [scheduleClearAll, scheduleInterimClear],
  );

  const applyTranslation = useCallback(
    (payload: MicTranscriptTranslationPayload) => {
      const id = payload?.id;
      const translation = (payload?.translation || '').trim();
      if (!id || !translation) return;
      const target = normalizeLang(payload.target_language) || 'unknown';

      let allTranslationsReceived = false;

      setLines((prev) => {
        const next = prev.map((line) => {
          if (line.id !== id) return line;
          const updated = {
            ...line,
            translations: {
              ...(line.translations || {}),
              [target]: {
                text: translation,
                ...(payload.target_language ? { targetLanguage: payload.target_language } : {}),
                ...(payload.source_language ? { sourceLanguage: payload.source_language } : {}),
              },
            },
          };
          const received = Object.keys(updated.translations!).length;
          if (updated.expectedTranslations && received >= updated.expectedTranslations) {
            allTranslationsReceived = true;
          }
          return updated;
        });
        return next;
      });

      if (allTranslationsReceived) {
        cancelTranslationWait();
        scheduleClearAll();
      }
    },
    [cancelTranslationWait, scheduleClearAll],
  );

  useEffect(() => () => {
    if (expiryTimerRef.current !== null) window.clearTimeout(expiryTimerRef.current);
    if (interimClearTimerRef.current !== null) window.clearTimeout(interimClearTimerRef.current);
    if (clearAllTimerRef.current !== null) window.clearTimeout(clearAllTimerRef.current);
    if (translationWaitTimerRef.current !== null) window.clearTimeout(translationWaitTimerRef.current);
  }, []);

  useEffect(() => {
    if (maxLines <= 0) { setLines([]); return; }
    setLines((prev) => prev.slice(-maxLines));
  }, [maxLines]);

  useEffect(() => { setLines((prev) => applyExpiryRules(prev)); }, [applyExpiryRules]);
  useEffect(() => { scheduleExpiryCheck(lines); }, [lines, scheduleExpiryCheck]);
  useEffect(() => { scheduleClearAll(); }, [scheduleClearAll]);

  useEffect(() => {
    if (!enabled) {
      if (expiryTimerRef.current !== null) { window.clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; }
      if (interimClearTimerRef.current !== null) { window.clearTimeout(interimClearTimerRef.current); interimClearTimerRef.current = null; }
      if (clearAllTimerRef.current !== null) { window.clearTimeout(clearAllTimerRef.current); clearAllTimerRef.current = null; }
      if (translationWaitTimerRef.current !== null) { window.clearTimeout(translationWaitTimerRef.current); translationWaitTimerRef.current = null; }
      setLines([]);
      setInterimLine(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = enabled ? backgroundColor : 'transparent';
    return () => { document.body.style.backgroundColor = 'transparent'; };
  }, [backgroundColor, enabled]);

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

  const getTranslationsForLine = useCallback((line: TranscriptLine): TranslationEntry[] => {
    const translations = line.translations || {};
    const out: TranslationEntry[] = [];
    for (let i = 0; i < translationSlots.length; i++) {
      const lang = translationSlots[i];
      if (!lang) continue;
      const t = (translations[lang]?.text || '').trim();
      if (!t || t === line.text) continue;
      out.push({ slotIndex: i, lang, text: t });
    }
    return out;
  }, [translationSlots]);

  const visibleLines = useMemo(() => {
    if (maxLines <= 0) return [];
    const now = Date.now();
    const base = lines.filter((line) => line.text && ((line.expiresAt ?? now) > now));
    if (!interimLine?.text) return base.slice(-maxLines);
    const keep = Math.max(maxLines - 1, 0);
    const trimmed = keep > 0 ? base.slice(-keep) : [];
    const marked = `${interimMarkerLeft ?? ''}${interimLine.text}${interimMarkerRight ?? ''}`;
    return [...trimmed, { ...interimLine, text: marked, isInterim: true }];
  }, [lines, interimLine, maxLines, interimMarkerLeft, interimMarkerRight]);

  const translationBlocks = useMemo(() => {
    if (!translationEnabled || stackedTranslation) return [];
    return visibleLines
      .filter((line) => !line.isInterim)
      .map((line) => {
        const translations = getTranslationsForLine(line);
        return translations.length > 0 ? { line, translations } : null;
      })
      .filter(Boolean) as Array<{ line: TranscriptLine; translations: TranslationEntry[] }>;
  }, [getTranslationsForLine, stackedTranslation, translationEnabled, visibleLines]);

  if (!enabled || visibleLines.length === 0) return null;

  const baseContainerStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    width: baseMaxWidth > 0 ? `${baseMaxWidth}px` : undefined,
    maxWidth: baseMaxWidth > 0 ? `${baseMaxWidth}px` : undefined,
    textAlign: derivedTextAlign as any,
    ...(frameHeightPx > 0 ? { height: `${frameHeightPx}px`, overflow: 'hidden' } : {}),
  };

  return (
    <>
      <div
        className={`fixed z-[20] flex flex-col pointer-events-none ${verticalJustifyClass} ${positionClass}`}
        style={baseContainerStyle}
      >
        {visibleLines.map((line, index) => (
          <div
            key={line.id}
            className={line.isInterim ? 'opacity-80' : ''}
            style={index > 0 && lineSpacing1Px !== 0 ? { marginTop: `${lineSpacing1Px}px` } : undefined}
          >
            {renderOutlinedText({
              text: line.text,
              fontSizePx: fontSize,
              fontWeight: speechFontWeight,
              fontFamily: speechFontFamily,
              fillColor: speechTextColor,
              strokeColor: speechStrokeColor,
              strokeWidthPx: speechStrokeWidthPx,
              ...(line.isInterim ? { opacity: 0.8 } : {}),
              ...(effectiveWhiteSpace ? { whiteSpace: effectiveWhiteSpace } : {}),
            })}
            {translationEnabled && stackedTranslation && !line.isInterim && (
              <div style={lineSpacing1Px !== 0 ? { marginTop: `${lineSpacing1Px}px` } : undefined}>
                {renderTranslationEntries(getTranslationsForLine(line), slotStyles, [0, lineSpacing2Px, lineSpacing3Px], line.id, effectiveWhiteSpace)}
              </div>
            )}
          </div>
        ))}
      </div>

      {translationEnabled && !stackedTranslation && translationBlocks.length > 0 && (
        <div
          className={`fixed z-[19] flex flex-col pointer-events-none ${verticalJustifyClass} ${translationPositionClass}`}
          style={{
            textAlign: derivedTextAlign as any,
            width: translationMaxWidthPx > 0 ? `${translationMaxWidthPx}px` : undefined,
            maxWidth: translationMaxWidthPx > 0 ? `${translationMaxWidthPx}px` : undefined,
            ...(frameHeightPx > 0 ? { height: `${frameHeightPx}px`, overflow: 'hidden' } : {}),
          }}
        >
          {translationBlocks.map(({ line, translations }) => (
            <div key={`${line.id}-translation`}>
              {renderTranslationEntries(translations, slotStyles, [0, lineSpacing2Px, lineSpacing3Px], line.id, effectiveWhiteSpace)}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
