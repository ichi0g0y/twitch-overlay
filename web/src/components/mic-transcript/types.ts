export interface MicTranscriptPayload {
  id?: string;
  text?: string;
  is_interim?: boolean;
  timestamp_ms?: number;
  expected_translations?: number;
}

export interface MicTranscriptTranslationPayload {
  id?: string;
  translation?: string;
  target_language?: string;
  source_language?: string;
  slot_index?: number;
}

export type TranscriptLine = {
  id: string;
  text: string;
  isInterim?: boolean;
  createdAt: number;
  expiresAt?: number;
  expectedTranslations?: number;
  translations?: Record<string, {
    text: string;
    targetLanguage?: string;
    sourceLanguage?: string;
    slotIndex?: number;
  }>;
};
