export type ChromeTranslationDownloadStatus = {
  status: 'downloading' | 'completed' | 'error';
  sourceLang: string;
  targetLang: string;
  progress?: number;
  message?: string;
};

type TranslatorAvailability = 'available' | 'downloadable' | 'unavailable' | string;

type TranslatorLike = {
  translate: (text: string) => Promise<string>;
  destroy?: () => Promise<void> | void;
};

type TranslatorAPI = {
  availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorAvailability>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: any) => void;
  }) => Promise<TranslatorLike>;
};

type LanguageDetectorLike = {
  detect: (text: string) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy?: () => Promise<void> | void;
};

type LanguageDetectorAPI = {
  create: () => Promise<LanguageDetectorLike>;
};

export class ChromeTranslatorClient {
  private translators = new Map<string, TranslatorLike>();
  private lastUsedAt = new Map<string, number>();
  private lastTranslateAt = new Map<string, number>();
  private detector: LanguageDetectorLike | null = null;
  private cleanupTimer: number | null = null;
  private supportedCache: boolean | null = null;

  private minIntervalMs: number;
  private unusedTtlMs: number;
  private cleanupIntervalMs: number;
  private onDownloadStatusChange: ((status: ChromeTranslationDownloadStatus) => void) | undefined;

  constructor(options?: {
    minIntervalMs?: number;
    unusedTtlMs?: number;
    cleanupIntervalMs?: number;
    onDownloadStatusChange?: (status: ChromeTranslationDownloadStatus) => void;
  }) {
    this.minIntervalMs = options?.minIntervalMs ?? 100;
    this.unusedTtlMs = options?.unusedTtlMs ?? 20 * 60 * 1000;
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 30 * 60 * 1000;
    this.onDownloadStatusChange = options?.onDownloadStatusChange;

    this.cleanupTimer = window.setInterval(() => {
      void this.performCleanup();
    }, this.cleanupIntervalMs);
  }

  private get translatorApi(): TranslatorAPI | null {
    const api = (self as any)?.Translator;
    if (!api) return null;
    if (typeof api.availability !== 'function') return null;
    if (typeof api.create !== 'function') return null;
    return api as TranslatorAPI;
  }

  private get detectorApi(): LanguageDetectorAPI | null {
    const api = (self as any)?.LanguageDetector;
    if (!api) return null;
    if (typeof api.create !== 'function') return null;
    return api as LanguageDetectorAPI;
  }

  isSupported(): boolean {
    if (this.supportedCache !== null) return this.supportedCache;
    this.supportedCache = this.translatorApi !== null;
    return this.supportedCache;
  }

  async initDetector(): Promise<void> {
    if (this.detector) return;
    const api = this.detectorApi;
    if (!api) return;
    try {
      this.detector = await api.create();
    } catch {
      this.detector = null;
    }
  }

  async availability(sourceLang: string, targetLang: string): Promise<TranslatorAvailability> {
    const api = this.translatorApi;
    if (!api) return 'unavailable';
    try {
      return await api.availability({ sourceLanguage: sourceLang, targetLanguage: targetLang });
    } catch {
      return 'unavailable';
    }
  }

  private key(sourceLang: string, targetLang: string): string {
    return `${sourceLang}__${targetLang}`;
  }

  private async waitForRateLimit(key: string): Promise<void> {
    const last = this.lastTranslateAt.get(key);
    if (last !== undefined) {
      const elapsed = Date.now() - last;
      if (elapsed < this.minIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
      }
    }
    this.lastTranslateAt.set(key, Date.now());
  }

  async getTranslator(sourceLang: string, targetLang: string): Promise<TranslatorLike> {
    const api = this.translatorApi;
    if (!api) {
      throw new Error('Chrome Translator API is not available (Chrome 138+ required)');
    }

    const k = this.key(sourceLang, targetLang);
    const cached = this.translators.get(k);
    if (cached && typeof cached.translate === 'function') {
      return cached;
    }

    const availability = await api.availability({ sourceLanguage: sourceLang, targetLanguage: targetLang });
    if (availability !== 'available' && availability !== 'downloadable') {
      throw new Error(`Translation unavailable (${sourceLang} -> ${targetLang}): ${availability}`);
    }

    const createOptions: any = { sourceLanguage: sourceLang, targetLanguage: targetLang };
    if (availability === 'downloadable') {
      this.onDownloadStatusChange?.({
        status: 'downloading',
        sourceLang,
        targetLang,
        progress: 0,
        message: `翻訳モデル(${sourceLang}→${targetLang})をダウンロード開始...`,
      });
      createOptions.monitor = (m: any) => {
        m.addEventListener('downloadprogress', (e: any) => {
          const pct = Math.round(Number(e?.loaded ?? 0) * 100);
          this.onDownloadStatusChange?.({
            status: 'downloading',
            sourceLang,
            targetLang,
            progress: pct,
            message: `翻訳モデル(${sourceLang}→${targetLang})をダウンロード中... ${pct}%`,
          });
        });
      };
    }

    const translator = await api.create(createOptions);
    this.translators.set(k, translator);
    this.lastUsedAt.set(k, Date.now());
    if (availability === 'downloadable') {
      this.onDownloadStatusChange?.({
        status: 'completed',
        sourceLang,
        targetLang,
        progress: 100,
        message: `翻訳モデル(${sourceLang}→${targetLang})の準備完了`,
      });
    }
    return translator;
  }

  async preload(sourceLang: string, targetLang: string): Promise<boolean> {
    if (!this.isSupported()) return false;
    const availability = await this.availability(sourceLang, targetLang);
    if (availability === 'available') {
      this.onDownloadStatusChange?.({
        status: 'completed',
        sourceLang,
        targetLang,
        progress: 100,
        message: `翻訳モデル(${sourceLang}→${targetLang})は既に利用可能`,
      });
      return true;
    }
    if (availability === 'downloadable') {
      await this.getTranslator(sourceLang, targetLang);
      return true;
    }
    return false;
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<{
    translatedText: string;
    sourceLanguage?: string;
    targetLanguage: string;
  }> {
    if (!this.isSupported()) {
      throw new Error('Chrome Translator API is not available (Chrome 138+ required)');
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return { translatedText: '', targetLanguage: targetLang };
    }

    let src = sourceLang.trim();
    const tgt = targetLang.trim();

    if (src === 'auto') {
      await this.initDetector();
      if (this.detector) {
        try {
          const results = await this.detector.detect(trimmed);
          if (Array.isArray(results) && results.length > 0) {
            const best = results[0];
            if (best?.detectedLanguage) {
              src = best.detectedLanguage;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (src === tgt) {
      return { translatedText: trimmed, sourceLanguage: src, targetLanguage: tgt };
    }

    const pairKey = this.key(src, tgt);
    await this.waitForRateLimit(pairKey);
    const translator = await this.getTranslator(src, tgt);
    this.lastUsedAt.set(pairKey, Date.now());
    const translatedText = await translator.translate(trimmed);
    return { translatedText, sourceLanguage: src, targetLanguage: tgt };
  }

  async performCleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    for (const key of this.translators.keys()) {
      const last = this.lastUsedAt.get(key) ?? 0;
      if (now - last > this.unusedTtlMs) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      const translator = this.translators.get(key);
      try {
        await translator?.destroy?.();
      } catch {
        // ignore
      }
      this.translators.delete(key);
      this.lastUsedAt.delete(key);
      this.lastTranslateAt.delete(key);
    }
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer !== null) {
      window.clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const translator of this.translators.values()) {
      try {
        await translator?.destroy?.();
      } catch {
        // ignore
      }
    }
    this.translators.clear();
    this.lastUsedAt.clear();
    this.lastTranslateAt.clear();

    try {
      await this.detector?.destroy?.();
    } catch {
      // ignore
    }
    this.detector = null;
  }
}

