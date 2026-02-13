import type { OverlaySettings } from '../../../contexts/SettingsContext';

export type SlotKeys = {
  language: keyof OverlaySettings;
  font_size: keyof OverlaySettings;
  font_weight: keyof OverlaySettings;
  font_family: keyof OverlaySettings;
  text_color: keyof OverlaySettings;
  stroke_color: keyof OverlaySettings;
  stroke_width_px: keyof OverlaySettings;
};

export const SLOT_KEYS: SlotKeys[] = [
  {
    language: 'mic_transcript_translation_language',
    font_size: 'mic_transcript_translation_font_size',
    font_weight: 'mic_transcript_translation_font_weight',
    font_family: 'mic_transcript_translation_font_family',
    text_color: 'mic_transcript_translation_text_color',
    stroke_color: 'mic_transcript_translation_stroke_color',
    stroke_width_px: 'mic_transcript_translation_stroke_width_px',
  },
  {
    language: 'mic_transcript_translation2_language',
    font_size: 'mic_transcript_translation2_font_size',
    font_weight: 'mic_transcript_translation2_font_weight',
    font_family: 'mic_transcript_translation2_font_family',
    text_color: 'mic_transcript_translation2_text_color',
    stroke_color: 'mic_transcript_translation2_stroke_color',
    stroke_width_px: 'mic_transcript_translation2_stroke_width_px',
  },
  {
    language: 'mic_transcript_translation3_language',
    font_size: 'mic_transcript_translation3_font_size',
    font_weight: 'mic_transcript_translation3_font_weight',
    font_family: 'mic_transcript_translation3_font_family',
    text_color: 'mic_transcript_translation3_text_color',
    stroke_color: 'mic_transcript_translation3_stroke_color',
    stroke_width_px: 'mic_transcript_translation3_stroke_width_px',
  },
];

export const SLOT_DEFAULTS = {
  font_size: 16,
  font_weight: 900,
  font_family: 'Noto Sans JP',
  text_color: '#ffffff',
  stroke_color: '#000000',
  stroke_width_px: 6,
};

export const MAX_SLOTS = 3;

export const TRANSLATION_LANGUAGES = [
  { value: 'ja', label: '日本語（ja）' },
  { value: 'en', label: '英語（en）' },
  { value: 'ko', label: '韓国語（ko）' },
  { value: 'zh', label: '中国語(簡)（zh）' },
  { value: 'zh-Hant', label: '中国語(繁)（zh-Hant）' },
  { value: 'fr', label: 'フランス語（fr）' },
  { value: 'it', label: 'イタリア語（it）' },
  { value: 'de', label: 'ドイツ語（de）' },
  { value: 'tr', label: 'トルコ語（tr）' },
  { value: 'sv', label: 'スウェーデン語（sv）' },
  { value: 'pl', label: 'ポーランド語（pl）' },
  { value: 'uk', label: 'ウクライナ語（uk）' },
  { value: 'ru', label: 'ロシア語（ru）' },
  { value: 'es', label: 'スペイン語（es）' },
  { value: 'pt', label: 'ポルトガル語（pt）' },
  { value: 'nl', label: 'オランダ語（nl）' },
  { value: 'id', label: 'インドネシア語（id）' },
  { value: 'vi', label: 'ベトナム語（vi）' },
  { value: 'th', label: 'タイ語（th）' },
  { value: 'ar', label: 'アラビア語（ar）' },
  { value: 'so', label: 'ソマリ語（so）' },
] as const;

export type SlotValues = {
  language: string;
  font_size: number;
  font_weight: number;
  font_family: string;
  text_color: string;
  stroke_color: string;
  stroke_width_px: number;
};

export function readSlot(settings: OverlaySettings | null, slotIndex: number): SlotValues {
  const keys = SLOT_KEYS[slotIndex];
  const s = settings as Record<string, unknown> | null;
  return {
    language: (s?.[keys.language] as string) ?? '',
    font_size: (s?.[keys.font_size] as number) ?? SLOT_DEFAULTS.font_size,
    font_weight: (s?.[keys.font_weight] as number) ?? SLOT_DEFAULTS.font_weight,
    font_family: (s?.[keys.font_family] as string) ?? SLOT_DEFAULTS.font_family,
    text_color: (s?.[keys.text_color] as string) ?? SLOT_DEFAULTS.text_color,
    stroke_color: (s?.[keys.stroke_color] as string) ?? SLOT_DEFAULTS.stroke_color,
    stroke_width_px: (s?.[keys.stroke_width_px] as number) ?? SLOT_DEFAULTS.stroke_width_px,
  };
}

export function writeSlot(slotIndex: number, values: SlotValues): Partial<OverlaySettings> {
  const keys = SLOT_KEYS[slotIndex];
  return {
    [keys.language]: values.language,
    [keys.font_size]: values.font_size,
    [keys.font_weight]: values.font_weight,
    [keys.font_family]: values.font_family,
    [keys.text_color]: values.text_color,
    [keys.stroke_color]: values.stroke_color,
    [keys.stroke_width_px]: values.stroke_width_px,
  } as Partial<OverlaySettings>;
}

export function normalizeMode(mode: string | undefined | null, legacyEnabled: boolean | undefined | null): 'off' | 'chrome' {
  const raw = (mode || '').trim();
  if (raw === 'chrome') return 'chrome';
  if (raw === 'off') return 'off';
  return legacyEnabled ? 'chrome' : 'off';
}

export function getActiveCount(mode: 'off' | 'chrome', settings: OverlaySettings | null): number {
  if (mode === 'off') return 0;
  const s = settings as Record<string, unknown> | null;
  const lang1 = ((s?.[SLOT_KEYS[0].language] as string) || '').trim();
  const lang2 = ((s?.[SLOT_KEYS[1].language] as string) || '').trim();
  const lang3 = ((s?.[SLOT_KEYS[2].language] as string) || '').trim();
  if (!lang1) return 0;
  if (!lang2) return 1;
  if (!lang3) return 2;
  return 3;
}

export function buildRemoveUpdate(
  removeIndex: number,
  activeCount: number,
  settings: OverlaySettings | null,
): Partial<OverlaySettings> {
  const update: Partial<OverlaySettings> = {};

  // Shift subsequent slots up
  for (let i = removeIndex; i < activeCount - 1; i++) {
    Object.assign(update, writeSlot(i, readSlot(settings, i + 1)));
  }

  // Clear the last occupied slot
  Object.assign(update, writeSlot(activeCount - 1, {
    language: '',
    ...SLOT_DEFAULTS,
  }));

  // Disable translation if no items remain
  if (activeCount - 1 === 0) {
    update.mic_transcript_translation_mode = 'off';
    update.mic_transcript_translation_enabled = false;
  }

  return update;
}
