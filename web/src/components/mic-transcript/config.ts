export const POSITION_CLASS: Record<string, string> = {
  'bottom-left': 'bottom-6 left-6 items-start',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-6 right-6 items-end',
  'top-left': 'top-6 left-6 items-start',
  'top-center': 'top-6 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-6 right-6 items-end',
};

export const DEFAULT_LINE_TTL_MS = 8000;
export const DEFAULT_LAST_TTL_MS = 8000;
export const INFINITE_EXPIRY = Number.POSITIVE_INFINITY;

export function normalizeLang(code: string | undefined | null): string {
  const raw = (code || '').trim();
  if (!raw) return '';
  if (raw === 'zh-Hant') return raw;

  const normalized = raw.toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('zh-') && normalized.includes('hant')) return 'zh-Hant';

  const base = normalized.split('-')[0] || '';
  return base === 'zh' ? 'zh' : base;
}

export function resolveTranslationMode(
  mode: string | undefined | null,
  legacyEnabled: boolean | undefined,
): 'off' | 'chrome' {
  const raw = (mode || '').trim();
  if (raw === 'chrome') return 'chrome';
  if (raw === 'off') return 'off';
  return legacyEnabled ? 'chrome' : 'off';
}
