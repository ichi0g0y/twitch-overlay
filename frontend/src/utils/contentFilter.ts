export type WordLists = {
  bad: string[];
  good: string[];
};

const BASE_URL = 'https://raw.githubusercontent.com/sayonari/goodBadWordlist/main/';

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

async function fetchListText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.text();
}

async function fetchWordList(url: string): Promise<string[]> {
  const text = await fetchListText(url);
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function loadWordLists(langCode: string | undefined | null): Promise<WordLists> {
  const langId = toFilterLangId(langCode);
  if (!langId) return { bad: [], good: [] };

  const cached = resolved.get(langId);
  if (cached) return cached;

  const existing = inflight.get(langId);
  if (existing) return existing;

  const promise = (async (): Promise<WordLists> => {
    try {
      const base = `${BASE_URL}${encodeURIComponent(langId)}`;
      const [bad, good] = await Promise.all([
        fetchWordList(`${base}/BadList.txt`).catch(() => []),
        fetchWordList(`${base}/GoodList.txt`).catch(() => []),
      ]);
      return { bad, good };
    } catch {
      return { bad: [], good: [] };
    }
  })();

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
