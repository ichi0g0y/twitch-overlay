import { normalizeLang } from './config';
import type {
  MicTranscriptTranslationPayload,
  TranscriptLine,
} from './types';

export const TRANSLATION_ALIAS_TTL_MS = 30000;
export const TRANSLATION_WAIT_TIMEOUT_MS = 30000;

interface TranslationUpdate {
  id: string;
  translation: string;
  translationKey: string;
  slotIndex: number;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export function resolveTranslationTargetId(
  rawId: string,
  aliases: Map<string, { to: string; at: number }>,
): string {
  const id = (rawId || '').trim();
  if (!id) return '';

  const now = Date.now();
  for (const [from, meta] of aliases.entries()) {
    if (now - meta.at > TRANSLATION_ALIAS_TTL_MS) {
      aliases.delete(from);
    }
  }

  let current = id;
  for (let i = 0; i < 8; i++) {
    const next = aliases.get(current)?.to;
    if (!next || next === current) break;
    current = next;
  }

  return current;
}

export function createTranslationUpdate(
  payload: MicTranscriptTranslationPayload,
  id: string,
): TranslationUpdate | null {
  const translation = (payload?.translation || '').trim();
  if (!id || !translation) return null;

  const target = normalizeLang(payload.target_language) || 'unknown';
  const slotIndex = Number.isInteger(payload.slot_index) ? Number(payload.slot_index) : -1;
  const translationKey = slotIndex >= 0 ? `slot_${slotIndex}` : target;

  return {
    id,
    translation,
    translationKey,
    slotIndex,
    sourceLanguage: payload.source_language,
    targetLanguage: payload.target_language,
  };
}

export function applyTranslationToLines(
  lines: TranscriptLine[],
  update: TranslationUpdate,
): { nextLines: TranscriptLine[]; allTranslationsReceived: boolean } {
  let allTranslationsReceived = false;

  const applyToLine = (line: TranscriptLine) => {
    const updated = {
      ...line,
      translations: {
        ...(line.translations || {}),
        [update.translationKey]: {
          text: update.translation,
          ...(update.targetLanguage ? { targetLanguage: update.targetLanguage } : {}),
          ...(update.sourceLanguage ? { sourceLanguage: update.sourceLanguage } : {}),
          ...(update.slotIndex >= 0 ? { slotIndex: update.slotIndex } : {}),
        },
      },
    };

    const received = Object.keys(updated.translations!).length;
    if (updated.expectedTranslations && received >= updated.expectedTranslations) {
      allTranslationsReceived = true;
    }
    return updated;
  };

  let matched = false;
  const next = lines.map((line) => {
    if (line.id !== update.id) return line;
    matched = true;
    return applyToLine(line);
  });

  if (matched) {
    return { nextLines: next, allTranslationsReceived };
  }

  const fallbackIndex = next.length - 1;
  if (fallbackIndex < 0) {
    return { nextLines: next, allTranslationsReceived };
  }

  const fallback = next[fallbackIndex];
  if (!fallback) {
    return { nextLines: next, allTranslationsReceived };
  }

  if (Date.now() - fallback.createdAt > TRANSLATION_WAIT_TIMEOUT_MS) {
    return { nextLines: next, allTranslationsReceived };
  }

  const recovered = [...next];
  recovered[fallbackIndex] = applyToLine(fallback);
  return { nextLines: recovered, allTranslationsReceived };
}
