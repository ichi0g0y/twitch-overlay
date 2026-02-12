import { buildApiUrl } from './api';

export type WordLists = {
  bad: string[];
  good: string[];
};

const resolved = new Map<string, WordLists>();
const inflight = new Map<string, Promise<WordLists>>();

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// フィルタ用ディレクトリ名へ正規化
export function toFilterLangId(langCode: string | undefined | null): string {
  const raw = (langCode || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/_/g, '-').toLowerCase();

  const map: Record<string, string> = {
    'zh-cn': 'zh',
    'zh-tw': 'zh',
    'zh-hk': 'zh',
    'zh-hant': 'zh',
    'en-us': 'en',
    'fr-fr': 'fr',
    'it-it': 'it',
    'de-de': 'de',
    'tr-tr': 'tr',
    'sv-se': 'sv',
    'pl-pl': 'pl',
    'uk-ua': 'uk',
    'ru-ru': 'ru',
    'es-es': 'es',
    'pt-pt': 'pt',
    'nl-nl': 'nl',
    'id-id': 'id',
    'vi-vn': 'vi',
    'th-th': 'th',
    'ar-sa': 'ar',
    'el-gr': 'el',
    'ja-jp': 'ja',
    'ko-kr': 'ko',
  };

  if (map[normalized]) return map[normalized];

  const base = normalized.split('-')[0] || '';
  if (base === 'zh') return 'zh';
  return base;
}

type WordFilterAPIItem = {
  id: number;
  language: string;
  word: string;
  type: 'bad' | 'good';
};

async function fetchWordListFromAPI(langId: string): Promise<WordLists> {
  const res = await fetch(buildApiUrl(`/api/word-filter?lang=${encodeURIComponent(langId)}`));
  if (!res.ok) return { bad: [], good: [] };
  const json = (await res.json()) as { data?: WordFilterAPIItem[] };
  const words = json.data || [];
  return {
    bad: words.filter((w) => w.type === 'bad').map((w) => w.word),
    good: words.filter((w) => w.type === 'good').map((w) => w.word),
  };
}

export async function loadWordLists(langCode: string | undefined | null): Promise<WordLists> {
  const langId = toFilterLangId(langCode);
  if (!langId) return { bad: [], good: [] };

  const cached = resolved.get(langId);
  if (cached) return cached;

  const existing = inflight.get(langId);
  if (existing) return existing;

  const promise = fetchWordListFromAPI(langId).catch(() => ({ bad: [] as string[], good: [] as string[] }));

  inflight.set(langId, promise);
  const lists = await promise;
  inflight.delete(langId);
  resolved.set(langId, lists);
  return lists;
}

export function getCachedWordLists(langCode: string | undefined | null): WordLists | null {
  const langId = toFilterLangId(langCode);
  if (!langId) return null;
  return resolved.get(langId) || null;
}

// キャッシュをクリア（ワード追加/削除後に再読み込みするため）
export function clearWordListCache(langCode?: string | undefined | null): void {
  if (langCode) {
    const langId = toFilterLangId(langCode);
    if (langId) {
      resolved.delete(langId);
      inflight.delete(langId);
    }
  } else {
    resolved.clear();
    inflight.clear();
  }
}

export function preloadWordLists(langCodes: Array<string | undefined | null>): void {
  const uniq = new Set<string>();
  for (const code of langCodes) {
    const id = toFilterLangId(code);
    if (id) uniq.add(id);
  }
  for (const id of uniq) {
    void loadWordLists(id);
  }
}

export function applyWordFilter(text: string, lists: WordLists): string {
  if (!text) return text;
  if (!lists.bad || lists.bad.length === 0) return text;

  let filtered = text;

  // Protect good words via placeholders.
  const placeholders: Array<{ placeholder: string; word: string }> = [];
  (lists.good || []).forEach((word, index) => {
    if (!word) return;
    const placeholder = `{{GOOD_WORD_${index}}}`;
    placeholders.push({ placeholder, word });
    const re = new RegExp(escapeRegExp(word), 'gi');
    filtered = filtered.replace(re, placeholder);
  });

  // Replace bad words with asterisks.
  lists.bad.forEach((word) => {
    if (!word) return;
    const re = new RegExp(escapeRegExp(word), 'gi');
    filtered = filtered.replace(re, '*'.repeat(word.length));
  });

  // Restore placeholders.
  placeholders.forEach(({ placeholder, word }) => {
    const re = new RegExp(escapeRegExp(placeholder), 'g');
    filtered = filtered.replace(re, word);
  });

  return filtered;
}

export function filterWithCachedLists(text: string, langCode: string | undefined | null): string {
  const lists = getCachedWordLists(langCode);
  if (!lists) return text;
  return applyWordFilter(text, lists);
}
