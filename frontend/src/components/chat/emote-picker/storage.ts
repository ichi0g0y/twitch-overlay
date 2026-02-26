import {
  EMOTE_CACHE_MAX_ENTRIES,
  EMOTE_CACHE_STORAGE_KEY,
  EMOTE_CACHE_TTL_MS,
  EMOTE_FAVORITES_MAX_ENTRIES,
  EMOTE_FAVORITES_STORAGE_KEY_LEGACY,
} from './constants';
import { parseEmoteGroupsFromResponse } from './parse';
import type { Emote, EmoteGroup, StoredEmoteCache } from './types';

export const getEmoteFavoriteKey = (emote: Emote) => {
  if (emote.id.trim() !== '') return emote.id.trim();
  return `${emote.source}:${emote.channelLogin ?? ''}:${emote.name}:${emote.url}`;
};

export const getEmoteUnavailableLabel = (emote: Emote) => {
  if (emote.source === 'channel') return `${emote.name} (サブスク未加入/利用条件未達)`;
  return `${emote.name} (利用不可)`;
};

const readStoredEmoteCache = (): StoredEmoteCache => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EMOTE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const next: StoredEmoteCache = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const savedAt = Number((value as { savedAt?: unknown }).savedAt);
      const groups = (value as { groups?: unknown }).groups;
      if (!Array.isArray(groups) || !Number.isFinite(savedAt)) continue;
      if (now - savedAt > EMOTE_CACHE_TTL_MS) continue;
      next[key] = { savedAt, groups };
    }
    return next;
  } catch {
    return {};
  }
};

const writeStoredEmoteCache = (cache: StoredEmoteCache) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EMOTE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors.
  }
};

export const saveGroupsToStorage = (requestKey: string, groups: EmoteGroup[]) => {
  if (typeof window === 'undefined') return;
  const cache = readStoredEmoteCache();
  cache[requestKey] = { savedAt: Date.now(), groups };
  const orderedEntries = Object.entries(cache)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, EMOTE_CACHE_MAX_ENTRIES);
  writeStoredEmoteCache(Object.fromEntries(orderedEntries));
};

export const loadGroupsFromStorage = (requestKey: string): EmoteGroup[] | null => {
  const cache = readStoredEmoteCache();
  const stored = cache[requestKey];
  if (!stored) return null;
  return parseEmoteGroupsFromResponse({ data: { groups: stored.groups } });
};

export const clearStoredGroups = (requestKey: string) => {
  const cache = readStoredEmoteCache();
  if (!(requestKey in cache)) return;
  delete cache[requestKey];
  writeStoredEmoteCache(cache);
};

export const sanitizeFavoriteKeys = (keys: unknown): string[] => {
  if (!Array.isArray(keys)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of keys) {
    if (typeof value !== 'string') continue;
    const key = value.trim();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
    if (next.length >= EMOTE_FAVORITES_MAX_ENTRIES) break;
  }
  return next;
};

export const readLegacyStoredFavoriteKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(EMOTE_FAVORITES_STORAGE_KEY_LEGACY);
    if (!raw) return [];
    return sanitizeFavoriteKeys(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const clearLegacyStoredFavoriteKeys = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EMOTE_FAVORITES_STORAGE_KEY_LEGACY);
  } catch {
    // Ignore storage errors.
  }
};

export const parseFavoriteKeysFromResponse = (raw: any): string[] => {
  return sanitizeFavoriteKeys(raw?.data?.keys);
};
