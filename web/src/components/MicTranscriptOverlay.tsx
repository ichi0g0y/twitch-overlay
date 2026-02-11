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

type TranscriptLine = {
  id: string;
  text: string;
  isInterim?: boolean;
  createdAt: number;
  expiresAt?: number;
  translations?: Record<
    string,
    {
      text: string;
      targetLanguage?: string;
      sourceLanguage?: string;
    }
  >;
};

export const MicTranscriptOverlay: React.FC = () => {
  const { settings } = useSettings();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimLine, setInterimLine] = useState<TranscriptLine | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const interimClearTimerRef = useRef<number | null>(null);
  const clearAllTimerRef = useRef<number | null>(null);
  const maxLines = settings?.mic_transcript_max_lines ?? 3;
  const enabled = settings?.mic_transcript_enabled ?? false;
  const translationEnabled = settings?.mic_transcript_translation_enabled ?? false;
  const position = settings?.mic_transcript_position || 'bottom-left';
  const vAlign = (settings?.mic_transcript_v_align || '').trim() || 'bottom';
  const frameHeightPx = settings?.mic_transcript_frame_height_px ?? 0;
  const fontSize = settings?.mic_transcript_font_size ?? 20;
  const translationFontSize = settings?.mic_transcript_translation_font_size ?? Math.max(fontSize - 6, 12);
  const maxWidthPx = settings?.mic_transcript_max_width_px ?? 0;
  const translationPosition = settings?.mic_transcript_translation_position || position;
  const translationMaxWidthPx = settings?.mic_transcript_translation_max_width_px ?? 0;
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
  const translationSlots = useMemo(
    () => [
      normalizeLang(settings?.mic_transcript_translation_language),
      normalizeLang(settings?.mic_transcript_translation2_language),
      normalizeLang(settings?.mic_transcript_translation3_language),
    ],
    [
      settings?.mic_transcript_translation2_language,
      settings?.mic_transcript_translation3_language,
      settings?.mic_transcript_translation_language,
    ],
  );

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
        const isLast = index === lastIndex;
        const ttl = isLast ? lastTtlMs : lineTtlMs;
        const createdAt = Number.isFinite(line.createdAt) ? line.createdAt : now;
        const expiresAt = ttl === INFINITE_EXPIRY ? INFINITE_EXPIRY : createdAt + ttl;
        return { ...line, createdAt, expiresAt };
      })
      .filter((line) => line.expiresAt === INFINITE_EXPIRY || line.expiresAt > now);
  }, [lastTtlMs, lineTtlMs]);

  const scheduleClearAll = useCallback(() => {
    if (clearAllTimerRef.current !== null) {
      window.clearTimeout(clearAllTimerRef.current);
      clearAllTimerRef.current = null;
    }
    const delay = Math.max(0, timerMs);
    if (!enabled || delay <= 0) {
      return;
    }
    clearAllTimerRef.current = window.setTimeout(() => {
      setLines([]);
      setInterimLine(null);
    }, delay);
  }, [enabled, timerMs]);

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
      const expiresAt = (line as TranscriptLine & { expiresAt?: number }).expiresAt;
      if (expiresAt === undefined || expiresAt === INFINITE_EXPIRY) {
        return min;
      }
      return Math.min(min, expiresAt);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextExpiry)) {
      return;
    }
    const delay = Math.max(nextExpiry - now, 0);
    expiryTimerRef.current = window.setTimeout(() => {
      setLines((prev) => applyExpiryRules(prev));
    }, delay);
  }, [applyExpiryRules]);

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
      const now = Date.now();

      setInterimLine(null);
      setLines((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.text === text) {
            const next = [...prev];
            next[next.length - 1] = { ...last, id, text, createdAt: now };
            return applyExpiryRules(next);
          }
          if (text.startsWith(last.text) || last.text.startsWith(text)) {
            const next = [...prev];
            next[next.length - 1] = { ...last, id, text, createdAt: now };
            return applyExpiryRules(next);
          }
        }
        const next = [...prev, { id, text, createdAt: now }].slice(-maxLines);
        return applyExpiryRules(next);
      });
      scheduleClearAll();
    },
    [applyExpiryRules, maxLines, scheduleClearAll]
  );

  const pushInterimLine = useCallback(
    (payload: MicTranscriptPayload) => {
      const text = (payload?.text || '').trim();
      if (!text) return;
      const id = payload.id || 'interim';
      const now = Date.now();

      setInterimLine((prev) => {
        if (prev?.text === text) {
          return prev;
        }
        return { id, text, createdAt: now };
      });
      scheduleInterimClear();
      scheduleClearAll();
    },
    [scheduleClearAll, scheduleInterimClear]
  );

  const applyTranslation = useCallback((payload: MicTranscriptTranslationPayload) => {
    const id = payload?.id;
    const translation = (payload?.translation || '').trim();
    if (!id || !translation) return;
    const target = normalizeLang(payload.target_language) || 'unknown';
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const prevTranslations = line.translations || {};
        return {
          ...line,
          translations: {
            ...prevTranslations,
            [target]: {
              text: translation,
              ...(payload.target_language ? { targetLanguage: payload.target_language } : {}),
              ...(payload.source_language ? { sourceLanguage: payload.source_language } : {}),
            },
          },
        };
      }),
    );
    scheduleClearAll();
  }, [scheduleClearAll]);

  useEffect(() => {
    return () => {
      if (expiryTimerRef.current !== null) {
        window.clearTimeout(expiryTimerRef.current);
      }
      if (interimClearTimerRef.current !== null) {
        window.clearTimeout(interimClearTimerRef.current);
      }
      if (clearAllTimerRef.current !== null) {
        window.clearTimeout(clearAllTimerRef.current);
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
    setLines((prev) => applyExpiryRules(prev));
  }, [applyExpiryRules]);

  useEffect(() => {
    scheduleExpiryCheck(lines);
  }, [lines, scheduleExpiryCheck]);

  useEffect(() => {
    scheduleClearAll();
  }, [scheduleClearAll]);

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
      setLines([]);
      setInterimLine(null);
    }
  }, [enabled]);

  useEffect(() => {
    // jimakuChan互換: bgcolor はオーバーレイ全体の背景色として扱う
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = enabled ? backgroundColor : 'transparent';
    return () => {
      document.body.style.backgroundColor = 'transparent';
    };
  }, [backgroundColor, enabled]);

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
    const marked = `${interimMarkerLeft ?? ''}${interimLine.text}${interimMarkerRight ?? ''}`;
    return [...trimmed, { ...interimLine, text: marked, isInterim: true }];
  }, [lines, interimLine, maxLines]);

  const getTranslationsForLine = useCallback((line: TranscriptLine) => {
    const translations = line.translations || {};
    const out: Array<{ slotIndex: number; lang: string; text: string }> = [];
    for (let i = 0; i < translationSlots.length; i += 1) {
      const lang = translationSlots[i];
      if (!lang) continue;
      const t = (translations[lang]?.text || '').trim();
      if (!t) continue;
      if (t === line.text) continue;
      out.push({ slotIndex: i, lang, text: t });
    }
    return out;
  }, [translationSlots]);

  // `-webkit-text-stroke` は線が文字の内側にも食い込むので、ストローク層と塗り層を分けて
  // 内側に入った分を上の塗りで隠し、外側ストロークに見えるようにするだす。
  const renderOutlinedText = useCallback(
    (opts: {
      text: string;
      fontSizePx: number;
      fontWeight: number;
      fontFamily: string;
      fillColor: string;
      strokeColor: string;
      strokeWidthPx: number;
      opacity?: number;
    }) => {
      const effectiveWhiteSpace = whiteSpaceSetting ? (whiteSpaceSetting as any) : ('pre-wrap' as any);
      const strokeWidth = Math.max(0, opts.strokeWidthPx);

      const base: React.CSSProperties = {
        fontSize: `${opts.fontSizePx}px`,
        fontWeight: opts.fontWeight,
        fontFamily: opts.fontFamily,
        whiteSpace: effectiveWhiteSpace,
        // 最大幅が効いてるように見せるための折り返し最適化だす
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
      };

      if (strokeWidth <= 0) {
        return (
          <span style={{ ...base, color: opts.fillColor, display: 'inline-block', maxWidth: '100%' }}>
            {opts.text}
          </span>
        );
      }

      const wrapper: React.CSSProperties = {
        ...base,
        display: 'inline-block',
        maxWidth: '100%',
        position: 'relative',
      };

      const strokeLayer: React.CSSProperties = {
        ...base,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        WebkitTextStrokeColor: opts.strokeColor,
        WebkitTextStrokeWidth: `${strokeWidth}px`,
      };

      const fillLayer: React.CSSProperties = {
        ...base,
        position: 'relative',
        color: opts.fillColor,
      };

      return (
        <span style={wrapper}>
          <span style={strokeLayer} aria-hidden="true">
            {opts.text}
          </span>
          <span style={fillLayer}>{opts.text}</span>
        </span>
      );
    },
    [whiteSpaceSetting],
  );

  const renderStackedTranslations = (line: TranscriptLine) => {
    if (!translationEnabled || !stackedTranslation) return null;
    if (line.isInterim) return null;
    const translations = getTranslationsForLine(line);
    if (translations.length === 0) return null;

    const spacings = [lineSpacing1Px, lineSpacing2Px, lineSpacing3Px];

    return (
      <div className="mt-0">
        {translations.slice(0, 3).map((t, displayIndex) => (
          <div
            key={`${line.id}-${t.lang}`}
            style={{
              ...(displayIndex === 0 ? { marginTop: `${Math.max(0, spacings[0] ?? 0)}px` } : { marginTop: `${Math.max(0, spacings[displayIndex] ?? 0)}px` }),
            }}
          >
            {renderOutlinedText({
              text: t.text,
              fontSizePx:
                t.slotIndex === 0
                  ? translationFontSize
                  : t.slotIndex === 1
                    ? trans2FontSize
                    : trans3FontSize,
              fontWeight:
                t.slotIndex === 0
                  ? transFontWeight
                  : t.slotIndex === 1
                    ? trans2FontWeight
                    : trans3FontWeight,
              fontFamily:
                t.slotIndex === 0
                  ? transFontFamily
                  : t.slotIndex === 1
                    ? trans2FontFamily
                    : trans3FontFamily,
              fillColor:
                t.slotIndex === 0
                  ? transTextColor
                  : t.slotIndex === 1
                    ? trans2TextColor
                    : trans3TextColor,
              strokeColor:
                t.slotIndex === 0
                  ? transStrokeColor
                  : t.slotIndex === 1
                    ? trans2StrokeColor
                    : trans3StrokeColor,
              strokeWidthPx:
                t.slotIndex === 0
                  ? transStrokeWidthPx
                  : t.slotIndex === 1
                    ? trans2StrokeWidthPx
                    : trans3StrokeWidthPx,
            })}
          </div>
        ))}
      </div>
    );
  };

  const translationBlocks = useMemo(() => {
    if (!translationEnabled || stackedTranslation) return [];
    return visibleLines
      .filter((line) => !line.isInterim)
      .map((line) => {
        const translations = getTranslationsForLine(line);
        if (translations.length === 0) return null;
        return { line, translations };
      })
      .filter(Boolean) as Array<{ line: TranscriptLine; translations: Array<{ slotIndex: number; lang: string; text: string }> }>;
  }, [getTranslationsForLine, stackedTranslation, translationEnabled, visibleLines]);

  if (!enabled || visibleLines.length === 0) {
    return null;
  }

  const baseContainerStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    maxWidth: baseMaxWidth > 0 ? `${baseMaxWidth}px` : undefined,
    textAlign: derivedTextAlign as any,
    ...(frameHeightPx > 0 ? { height: `${frameHeightPx}px`, overflow: 'hidden' } : {}),
  };

  return (
    <>
      <div
        className={`fixed z-[20] flex flex-col gap-2 pointer-events-none ${verticalJustifyClass} ${positionClass}`}
        style={baseContainerStyle}
      >
        {visibleLines.map((line) => (
          <div
            key={line.id}
            className={line.isInterim ? 'opacity-80' : ''}
          >
            {renderOutlinedText({
              text: line.text,
              fontSizePx: fontSize,
              fontWeight: speechFontWeight,
              fontFamily: speechFontFamily,
              fillColor: speechTextColor,
              strokeColor: speechStrokeColor,
              strokeWidthPx: speechStrokeWidthPx,
              opacity: line.isInterim ? 0.8 : undefined,
            })}
            {renderStackedTranslations(line)}
          </div>
        ))}
      </div>

      {translationEnabled && !stackedTranslation && translationBlocks.length > 0 ? (
        <div
          className={`fixed z-[19] flex flex-col gap-2 pointer-events-none ${verticalJustifyClass} ${translationPositionClass}`}
          style={{
            textAlign: derivedTextAlign as any,
            maxWidth: translationMaxWidthPx > 0 ? `${translationMaxWidthPx}px` : undefined,
            ...(frameHeightPx > 0 ? { height: `${frameHeightPx}px`, overflow: 'hidden' } : {}),
          }}
        >
          {translationBlocks.map(({ line, translations }) => (
            <div key={`${line.id}-translation`}>
              {translations.slice(0, 3).map((t, displayIndex) => (
                <div
                  key={`${line.id}-${t.lang}`}
                  style={{
                    ...(displayIndex === 0 ? {} : { marginTop: `${Math.max(0, [lineSpacing2Px, lineSpacing3Px][displayIndex - 1] ?? 0)}px` }),
                  }}
                >
                  {renderOutlinedText({
                    text: t.text,
                    fontSizePx:
                      t.slotIndex === 0 ? translationFontSize : t.slotIndex === 1 ? trans2FontSize : trans3FontSize,
                    fontWeight:
                      t.slotIndex === 0 ? transFontWeight : t.slotIndex === 1 ? trans2FontWeight : trans3FontWeight,
                    fontFamily:
                      t.slotIndex === 0 ? transFontFamily : t.slotIndex === 1 ? trans2FontFamily : trans3FontFamily,
                    fillColor:
                      t.slotIndex === 0 ? transTextColor : t.slotIndex === 1 ? trans2TextColor : trans3TextColor,
                    strokeColor:
                      t.slotIndex === 0 ? transStrokeColor : t.slotIndex === 1 ? trans2StrokeColor : trans3StrokeColor,
                    strokeWidthPx:
                      t.slotIndex === 0
                        ? transStrokeWidthPx
                        : t.slotIndex === 1
                          ? trans2StrokeWidthPx
                          : trans3StrokeWidthPx,
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};
