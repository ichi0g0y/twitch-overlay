import type {
  LanguageDetectorAPI,
  TranslatorAPI,
} from './types';

export const resolveTranslatorApi = (): TranslatorAPI | null => {
  const api = (self as any)?.Translator;
  if (!api) return null;
  if (typeof api.availability !== 'function') return null;
  if (typeof api.create !== 'function') return null;
  return api as TranslatorAPI;
};

export const resolveDetectorApi = (): LanguageDetectorAPI | null => {
  const api = (self as any)?.LanguageDetector;
  if (!api) return null;
  if (typeof api.create !== 'function') return null;
  return api as LanguageDetectorAPI;
};
