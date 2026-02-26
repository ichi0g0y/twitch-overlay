import React, { useCallback, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import {
  renderOutlinedText,
  renderTranslationEntries,
  type TranslationEntry,
  type TranslationSlotStyle,
} from './MicTranscriptRenderer';
import {
  DEFAULT_LAST_TTL_MS,
  DEFAULT_LINE_TTL_MS,
  INFINITE_EXPIRY,
  normalizeLang,
  POSITION_CLASS,
  resolveTranslationMode,
} from './mic-transcript/config';
import { useMicTranscriptLines } from './mic-transcript/useMicTranscriptLines';
import type { TranscriptLine } from './mic-transcript/types';

export const MicTranscriptOverlay: React.FC = () => {
  const { settings } = useSettings();

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
  const translationFontSize =
    settings?.mic_transcript_translation_font_size ?? Math.max(fontSize - 6, 12);
  const maxWidthPx = settings?.mic_transcript_max_width_px ?? 0;
  const translationPosition = settings?.mic_transcript_translation_position || position;
  const translationMaxWidthPx = maxWidthPx;
  const textAlignSetting = (settings?.mic_transcript_text_align || '').trim();
  const whiteSpaceSetting = (settings?.mic_transcript_white_space || '').trim();
  const backgroundColor =
    (settings?.mic_transcript_background_color || '').trim() || 'transparent';
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
  const trans2StrokeWidthPx =
    settings?.mic_transcript_translation2_stroke_width_px ?? transStrokeWidthPx;
  const trans2FontWeight = settings?.mic_transcript_translation2_font_weight ?? transFontWeight;
  const trans2FontFamily = settings?.mic_transcript_translation2_font_family ?? transFontFamily;

  const trans3FontSize = settings?.mic_transcript_translation3_font_size ?? translationFontSize;
  const trans3TextColor = settings?.mic_transcript_translation3_text_color ?? transTextColor;
  const trans3StrokeColor = settings?.mic_transcript_translation3_stroke_color ?? transStrokeColor;
  const trans3StrokeWidthPx =
    settings?.mic_transcript_translation3_stroke_width_px ?? transStrokeWidthPx;
  const trans3FontWeight = settings?.mic_transcript_translation3_font_weight ?? transFontWeight;
  const trans3FontFamily = settings?.mic_transcript_translation3_font_family ?? transFontFamily;

  const lineTtlMs =
    Math.max(1, settings?.mic_transcript_line_ttl_seconds ?? DEFAULT_LINE_TTL_MS / 1000) * 1000;
  const lastTtlSeconds = settings?.mic_transcript_last_ttl_seconds ?? DEFAULT_LAST_TTL_MS / 1000;
  const lastTtlMs =
    lastTtlSeconds <= 0 ? INFINITE_EXPIRY : Math.max(1, lastTtlSeconds) * 1000;

  const positionClass = POSITION_CLASS[position] || POSITION_CLASS['bottom-left'];
  const translationPositionClass =
    POSITION_CLASS[translationPosition] || POSITION_CLASS['bottom-left'];
  const verticalJustifyClass = vAlign === 'top' ? 'justify-start' : 'justify-end';
  const stackedTranslation = translationEnabled && translationPosition === position;
  const effectiveWhiteSpace = whiteSpaceSetting || undefined;

  const translationSlots = useMemo(() => {
    const primary = normalizeLang(settings?.mic_transcript_translation_language);
    const fallbackPrimary = translationEnabled ? primary || 'en' : primary;
    return [
      fallbackPrimary,
      normalizeLang(settings?.mic_transcript_translation2_language),
      normalizeLang(settings?.mic_transcript_translation3_language),
    ];
  }, [
    settings?.mic_transcript_translation_language,
    settings?.mic_transcript_translation2_language,
    settings?.mic_transcript_translation3_language,
    translationEnabled,
  ]);

  const slotStyles: TranslationSlotStyle[] = useMemo(
    () => [
      {
        fontSize: translationFontSize,
        fontWeight: transFontWeight,
        fontFamily: transFontFamily,
        textColor: transTextColor,
        strokeColor: transStrokeColor,
        strokeWidthPx: transStrokeWidthPx,
      },
      {
        fontSize: trans2FontSize,
        fontWeight: trans2FontWeight,
        fontFamily: trans2FontFamily,
        textColor: trans2TextColor,
        strokeColor: trans2StrokeColor,
        strokeWidthPx: trans2StrokeWidthPx,
      },
      {
        fontSize: trans3FontSize,
        fontWeight: trans3FontWeight,
        fontFamily: trans3FontFamily,
        textColor: trans3TextColor,
        strokeColor: trans3StrokeColor,
        strokeWidthPx: trans3StrokeWidthPx,
      },
    ],
    [
      translationFontSize,
      transFontWeight,
      transFontFamily,
      transTextColor,
      transStrokeColor,
      transStrokeWidthPx,
      trans2FontSize,
      trans2FontWeight,
      trans2FontFamily,
      trans2TextColor,
      trans2StrokeColor,
      trans2StrokeWidthPx,
      trans3FontSize,
      trans3FontWeight,
      trans3FontFamily,
      trans3TextColor,
      trans3StrokeColor,
      trans3StrokeWidthPx,
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

  const { visibleLines } = useMicTranscriptLines({
    enabled,
    maxLines,
    lineTtlMs,
    lastTtlMs,
    timerMs,
    interimMarkerLeft,
    interimMarkerRight,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = enabled ? backgroundColor : 'transparent';
    return () => {
      document.body.style.backgroundColor = 'transparent';
    };
  }, [backgroundColor, enabled]);

  const getTranslationsForLine = useCallback(
    (line: TranscriptLine): TranslationEntry[] => {
      const translations = line.translations || {};
      const out: TranslationEntry[] = [];
      for (let i = 0; i < translationSlots.length; i++) {
        const lang = translationSlots[i];
        if (!lang) continue;
        const slotValue = translations[`slot_${i}`];
        const fallbackValue = translations[lang];
        const text = (slotValue?.text || fallbackValue?.text || '').trim();
        if (!text) continue;
        out.push({ slotIndex: i, lang, text });
      }
      return out;
    },
    [translationSlots],
  );

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
    textAlign: derivedTextAlign as React.CSSProperties['textAlign'],
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
            style={
              index > 0 && lineSpacing1Px !== 0
                ? { marginTop: `${lineSpacing1Px}px` }
                : undefined
            }
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
                {renderTranslationEntries(
                  getTranslationsForLine(line),
                  slotStyles,
                  [0, lineSpacing2Px, lineSpacing3Px],
                  line.id,
                  effectiveWhiteSpace,
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {translationEnabled && !stackedTranslation && translationBlocks.length > 0 && (
        <div
          className={`fixed z-[19] flex flex-col pointer-events-none ${verticalJustifyClass} ${translationPositionClass}`}
          style={{
            textAlign: derivedTextAlign as React.CSSProperties['textAlign'],
            width: translationMaxWidthPx > 0 ? `${translationMaxWidthPx}px` : undefined,
            maxWidth: translationMaxWidthPx > 0 ? `${translationMaxWidthPx}px` : undefined,
            ...(frameHeightPx > 0 ? { height: `${frameHeightPx}px`, overflow: 'hidden' } : {}),
          }}
        >
          {translationBlocks.map(({ line, translations }) => (
            <div key={`${line.id}-translation`}>
              {renderTranslationEntries(
                translations,
                slotStyles,
                [0, lineSpacing2Px, lineSpacing3Px],
                line.id,
                effectiveWhiteSpace,
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
