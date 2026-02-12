export type BrowserInfo = {
  name: string;
  version?: string;
  platform?: string;
  userAgent?: string;
};

// Chromium系機能の目安だす（実際はフラグ/Origin Trial/OS差があり得るだす）
export const MIN_CHROME_VERSION = {
  // Web Speech API (webkitSpeechRecognition) はChrome系で長年提供されているが、
  // 互換目安として古すぎない最低ラインを出すだす。
  speechRecognition: 33,
  // Chrome Built-in AI: Translator / Language Detector
  // https://developer.chrome.com/docs/ai/built-in-apis#translator_api
  translatorApi: 138,
  // https://developer.chrome.com/docs/ai/built-in-apis#language_detector_api
  languageDetectorApi: 138,
} as const;

function parseUserAgent(ua: string): BrowserInfo {
  const userAgent = ua || '';

  // Order matters: Edge/Opera include "Chrome/" too.
  const edge = userAgent.match(/Edg\/([0-9.]+)/);
  if (edge) return { name: 'Microsoft Edge', version: edge[1], userAgent };

  const opera = userAgent.match(/OPR\/([0-9.]+)/);
  if (opera) return { name: 'Opera', version: opera[1], userAgent };

  const chrome = userAgent.match(/Chrome\/([0-9.]+)/);
  if (chrome) return { name: 'Google Chrome', version: chrome[1], userAgent };

  const firefox = userAgent.match(/Firefox\/([0-9.]+)/);
  if (firefox) return { name: 'Firefox', version: firefox[1], userAgent };

  const safari = userAgent.match(/Version\/([0-9.]+).*Safari\//);
  if (safari) return { name: 'Safari', version: safari[1], userAgent };

  return { name: 'Unknown', userAgent };
}

export function getBrowserInfo(): BrowserInfo {
  if (typeof navigator === 'undefined') return { name: 'Unknown' };

  const ua = navigator.userAgent || '';
  const anyNav = navigator as any;

  // Prefer User-Agent Client Hints (Chromium).
  const uaData = anyNav.userAgentData;
  if (uaData && Array.isArray(uaData.brands)) {
    const brands: Array<{ brand: string; version: string }> = uaData.brands;
    const pick =
      brands.find((b) => /Chrome/i.test(b.brand)) ??
      brands.find((b) => b.brand && !/Not\s*A\s*Brand/i.test(b.brand)) ??
      brands[0];
    const platform = typeof uaData.platform === 'string' ? uaData.platform : undefined;
    if (pick?.brand) {
      return {
        name: pick.brand,
        version: pick.version,
        platform,
        userAgent: ua,
      };
    }
  }

  return parseUserAgent(ua);
}

export function getChromeMajorVersion(info?: BrowserInfo): number | null {
  const target = info ?? getBrowserInfo();
  const raw = (target.version || '').trim();
  if (!raw) return null;
  const major = Number.parseInt(raw.split('.')[0] || '', 10);
  return Number.isFinite(major) ? major : null;
}

export function isChromeAtLeast(minMajor: number, info?: BrowserInfo): boolean | null {
  const major = getChromeMajorVersion(info);
  if (major === null) return null;
  return major >= minMajor;
}
