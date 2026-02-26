import { MIN_CHROME_VERSION } from '@/utils/browserInfo';
import { resolveDetectorApi, resolveTranslatorApi } from './api';
import type {
  ChromeTranslationDownloadStatus,
  LanguageDetectorLike,
  TranslatorAvailability,
  TranslatorLike,
} from './types';

type ChromeTranslatorClientOptions = {
  minIntervalMs?: number;
  unusedTtlMs?: number;
  cleanupIntervalMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  gcIntervalCount?: number;
  onDownloadStatusChange?: (status: ChromeTranslationDownloadStatus) => void;
};

const unsupportedError = () => (
  new Error(`Chrome Translator API is not available (Chrome ${MIN_CHROME_VERSION.translatorApi}+ required)`)
);

export class ChromeTranslatorClient {
  private translators = new Map<string, TranslatorLike>();
  private lastUsedAt = new Map<string, number>();
  private lastTranslateAt = new Map<string, number>();
  private detector: LanguageDetectorLike | null = null;
  private cleanupTimer: number | null = null;
  private supportedCache: boolean | null = null;
  private translationCount = 0;
  private minIntervalMs: number;
  private unusedTtlMs: number;
  private cleanupIntervalMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private gcIntervalCount: number;
  private onDownloadStatusChange: ((status: ChromeTranslationDownloadStatus) => void) | undefined;

  constructor(options?: ChromeTranslatorClientOptions) {
    this.minIntervalMs = options?.minIntervalMs ?? 100;
    this.unusedTtlMs = options?.unusedTtlMs ?? 20 * 60 * 1000;
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 30 * 60 * 1000;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 1000;
    this.gcIntervalCount = options?.gcIntervalCount ?? 1000;
    this.onDownloadStatusChange = options?.onDownloadStatusChange;
    this.cleanupTimer = window.setInterval(() => {
      void this.performCleanup();
    }, this.cleanupIntervalMs);
  }

  isSupported(): boolean {
    if (this.supportedCache !== null) return this.supportedCache;
    this.supportedCache = resolveTranslatorApi() !== null;
    return this.supportedCache;
  }

  async initDetector(): Promise<void> {
    if (this.detector) return;
    const api = resolveDetectorApi();
    if (!api) return;
    try {
      this.detector = await api.create();
    } catch {
      this.detector = null;
    }
  }

  async availability(sourceLang: string, targetLang: string): Promise<TranslatorAvailability> {
    const api = resolveTranslatorApi();
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

  private isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const name = err.name || '';
    const msg = err.message || '';
    return name === 'UnknownError' || msg.includes('network') || msg.includes('aborted');
  }

  private async translateWithRetry(translator: TranslatorLike, text: string, attempt = 0): Promise<string> {
    try {
      return await translator.translate(text);
    } catch (err: unknown) {
      if (!this.isRetryableError(err) || attempt >= this.maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
      return this.translateWithRetry(translator, text, attempt + 1);
    }
  }

  private maybeGc(): void {
    if (this.translationCount <= 0 || this.translationCount % this.gcIntervalCount !== 0) return;
    const gc = (window as any).gc;
    if (typeof gc !== 'function') return;
    try {
      gc();
    } catch {
      // ignore
    }
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

  private notifyDownloading(sourceLang: string, targetLang: string): void {
    this.onDownloadStatusChange?.({
      status: 'downloading',
      sourceLang,
      targetLang,
      progress: 0,
      message: `翻訳モデル(${sourceLang}→${targetLang})をダウンロード開始...`,
    });
  }

  private notifyDownloadProgress(sourceLang: string, targetLang: string, loaded: unknown): void {
    const progress = Math.round(Number(loaded ?? 0) * 100);
    this.onDownloadStatusChange?.({
      status: 'downloading',
      sourceLang,
      targetLang,
      progress,
      message: `翻訳モデル(${sourceLang}→${targetLang})をダウンロード中... ${progress}%`,
    });
  }

  private notifyDownloaded(sourceLang: string, targetLang: string): void {
    this.onDownloadStatusChange?.({
      status: 'completed',
      sourceLang,
      targetLang,
      progress: 100,
      message: `翻訳モデル(${sourceLang}→${targetLang})の準備完了`,
    });
  }

  async getTranslator(sourceLang: string, targetLang: string): Promise<TranslatorLike> {
    const api = resolveTranslatorApi();
    if (!api) throw unsupportedError();

    const key = this.key(sourceLang, targetLang);
    const cached = this.translators.get(key);
    if (cached && typeof cached.translate === 'function') return cached;

    const availability = await api.availability({ sourceLanguage: sourceLang, targetLanguage: targetLang });
    if (availability !== 'available' && availability !== 'downloadable') {
      throw new Error(`Translation unavailable (${sourceLang} -> ${targetLang}): ${availability}`);
    }

    const createOptions: any = { sourceLanguage: sourceLang, targetLanguage: targetLang };
    if (availability === 'downloadable') {
      this.notifyDownloading(sourceLang, targetLang);
      createOptions.monitor = (monitor: any) => {
        monitor.addEventListener('downloadprogress', (event: any) => {
          this.notifyDownloadProgress(sourceLang, targetLang, event?.loaded);
        });
      };
    }

    const translator = await api.create(createOptions);
    this.translators.set(key, translator);
    this.lastUsedAt.set(key, Date.now());
    if (availability === 'downloadable') this.notifyDownloaded(sourceLang, targetLang);
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
    if (!this.isSupported()) throw unsupportedError();

    const trimmed = text.trim();
    if (!trimmed) return { translatedText: '', targetLanguage: targetLang };

    let src = sourceLang.trim();
    const tgt = targetLang.trim();
    if (src === 'auto') {
      await this.initDetector();
      if (this.detector) {
        try {
          const results = await this.detector.detect(trimmed);
          if (Array.isArray(results) && results.length > 0 && results[0]?.detectedLanguage) {
            src = results[0].detectedLanguage;
          }
        } catch {
          // ignore
        }
      }
    }

    if (src === tgt) return { translatedText: trimmed, sourceLanguage: src, targetLanguage: tgt };

    const pairKey = this.key(src, tgt);
    await this.waitForRateLimit(pairKey);
    const translator = await this.getTranslator(src, tgt);
    this.lastUsedAt.set(pairKey, Date.now());
    const translatedText = await this.translateWithRetry(translator, trimmed);
    this.translationCount++;
    this.maybeGc();
    return { translatedText, sourceLanguage: src, targetLanguage: tgt };
  }

  async performCleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    for (const key of this.translators.keys()) {
      const last = this.lastUsedAt.get(key) ?? 0;
      if (now - last > this.unusedTtlMs) toRemove.push(key);
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
