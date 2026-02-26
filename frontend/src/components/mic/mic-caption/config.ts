import { useMemo } from 'react';
import type { OverlaySettings } from '../../../contexts/SettingsContext';
import type { MicCaptionConfig } from './types';

const normalizeSpeechLang = (code: string | undefined | null, fallback: string): string => {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  return raw.replace(/_/g, '-');
};

const normalizeTranslationLang = (code: string | undefined | null, fallback: string): string => {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  if (raw === 'zh-Hant') return raw;

  const normalized = raw.replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (lower === 'zh-tw') return 'zh-Hant';
  if (lower === 'zh-cn') return 'zh';
  if (lower.startsWith('zh-') && lower.includes('hant')) return 'zh-Hant';

  return lower.split('-')[0] || fallback;
};

export const useMicCaptionConfig = (overlaySettings: OverlaySettings | null): MicCaptionConfig => {
  const speechLang = useMemo(
    () => normalizeSpeechLang(overlaySettings?.mic_transcript_speech_language, 'ja'),
    [overlaySettings?.mic_transcript_speech_language],
  );

  const translationMode = overlaySettings?.mic_transcript_translation_mode
    ?? ((overlaySettings?.mic_transcript_translation_enabled ?? false) ? 'chrome' : 'off');
  const translationEnabled = translationMode !== 'off';

  const translationRequests = useMemo(() => {
    if (!translationEnabled) return [];
    const raw1 = (overlaySettings?.mic_transcript_translation_language || '').trim();
    const raw2 = (overlaySettings?.mic_transcript_translation2_language || '').trim();
    const raw3 = (overlaySettings?.mic_transcript_translation3_language || '').trim();
    const slots = [
      { slotIndex: 0, target: normalizeTranslationLang(raw1 || 'en', '') },
      { slotIndex: 1, target: normalizeTranslationLang(raw2, '') },
      { slotIndex: 2, target: normalizeTranslationLang(raw3, '') },
    ];
    return slots.filter((item) => item.target !== '');
  }, [
    overlaySettings?.mic_transcript_translation2_language,
    overlaySettings?.mic_transcript_translation3_language,
    overlaySettings?.mic_transcript_translation_language,
    translationEnabled,
  ]);

  const translationTargets = useMemo(
    () => translationRequests.map((item) => item.target),
    [translationRequests],
  );

  const translationGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const { slotIndex, target } of translationRequests) {
      const current = map.get(target);
      if (current) current.push(slotIndex);
      else map.set(target, [slotIndex]);
    }
    return Array.from(map.entries()).map(([target, slotIndices]) => ({ target, slotIndices }));
  }, [translationRequests]);

  return {
    speechLang,
    shortPauseMs: overlaySettings?.mic_transcript_speech_short_pause_ms ?? 800,
    interimThrottleMs: overlaySettings?.mic_transcript_speech_interim_throttle_ms ?? 200,
    dualInstanceEnabled: overlaySettings?.mic_transcript_speech_dual_instance_enabled ?? true,
    restartDelayMs: overlaySettings?.mic_transcript_speech_restart_delay_ms ?? 100,
    antiSexualEnabled: overlaySettings?.mic_transcript_anti_sexual_enabled ?? false,
    bouyomiEnabled: overlaySettings?.mic_transcript_bouyomi_enabled ?? false,
    bouyomiUrl: (overlaySettings?.mic_transcript_bouyomi_url || '').trim(),
    translationEnabled,
    translationRequests,
    translationTargets,
    translationGroups,
    enabledSetting: overlaySettings?.mic_transcript_speech_enabled ?? false,
  };
};
