export type ChromeTranslationDownloadStatus = {
  status: 'downloading' | 'completed' | 'error';
  sourceLang: string;
  targetLang: string;
  progress?: number;
  message?: string;
};

export type TranslatorAvailability =
  | 'available'
  | 'downloadable'
  | 'unavailable'
  | string;

export type TranslatorLike = {
  translate: (text: string) => Promise<string>;
  destroy?: () => Promise<void> | void;
};

export type TranslatorAPI = {
  availability: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorAvailability>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: any) => void;
  }) => Promise<TranslatorLike>;
};

export type LanguageDetectorLike = {
  detect: (
    text: string,
  ) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy?: () => Promise<void> | void;
};

export type LanguageDetectorAPI = {
  create: () => Promise<LanguageDetectorLike>;
};
