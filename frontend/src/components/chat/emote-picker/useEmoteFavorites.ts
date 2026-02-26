import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearLegacyStoredFavoriteKeys,
  getEmoteFavoriteKey,
  parseFavoriteKeysFromResponse,
  readLegacyStoredFavoriteKeys,
  sanitizeFavoriteKeys,
} from './storage';
import type { Emote, EmoteGroup } from './types';

export const useEmoteFavorites = ({
  open,
  favoriteApiUrl,
  displayGroups,
  keyword,
}: {
  open: boolean;
  favoriteApiUrl: string;
  displayGroups: EmoteGroup[];
  keyword: string;
}) => {
  const favoriteInitDoneRef = useRef(false);
  const favoriteSaveControllerRef = useRef<AbortController | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open || favoriteInitDoneRef.current) return;

    let cancelled = false;
    const controller = new AbortController();
    const loadFavoriteKeys = async () => {
      const legacyKeys = readLegacyStoredFavoriteKeys();
      try {
        const response = await fetch(favoriteApiUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (cancelled) return;
        const keys = parseFavoriteKeysFromResponse(data);
        if (keys.length > 0) {
          setFavoriteKeys(keys);
          clearLegacyStoredFavoriteKeys();
          favoriteInitDoneRef.current = true;
          return;
        }

        if (legacyKeys.length > 0) {
          setFavoriteKeys(legacyKeys);
          favoriteInitDoneRef.current = true;
          try {
            await fetch(favoriteApiUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keys: legacyKeys }),
              signal: controller.signal,
            });
            clearLegacyStoredFavoriteKeys();
          } catch (migrationError) {
            console.warn('[EmotePicker] Failed to migrate legacy favorites to DB:', migrationError);
          }
          return;
        }

        setFavoriteKeys([]);
        favoriteInitDoneRef.current = true;
      } catch (fetchError) {
        if (controller.signal.aborted || cancelled) return;
        console.warn('[EmotePicker] Failed to load favorite keys from DB:', fetchError);
        setFavoriteKeys(legacyKeys);
        favoriteInitDoneRef.current = true;
      }
    };

    void loadFavoriteKeys();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [favoriteApiUrl, open]);

  const usableEmoteMap = useMemo(() => {
    const map = new Map<string, Emote>();
    for (const group of displayGroups) {
      for (const emote of group.emotes) {
        if (!emote.usable) continue;
        const key = getEmoteFavoriteKey(emote);
        if (!map.has(key)) map.set(key, emote);
      }
    }
    return map;
  }, [displayGroups]);

  const favoriteEmotes = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return favoriteKeys
      .map((key) => usableEmoteMap.get(key))
      .filter((emote): emote is Emote => emote !== undefined)
      .filter((emote) => normalizedKeyword === '' || emote.name.toLowerCase().includes(normalizedKeyword));
  }, [favoriteKeys, keyword, usableEmoteMap]);

  const persistFavoriteKeys = async (keys: string[]) => {
    favoriteSaveControllerRef.current?.abort();
    const controller = new AbortController();
    favoriteSaveControllerRef.current = controller;
    try {
      const response = await fetch(favoriteApiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (saveError) {
      if (!controller.signal.aborted) {
        console.warn('[EmotePicker] Failed to save favorite keys to DB:', saveError);
      }
    }
  };

  const toggleFavorite = (emote: Emote) => {
    if (!emote.usable) return;
    const targetKey = getEmoteFavoriteKey(emote);
    setFavoriteKeys((prev) => {
      const exists = prev.includes(targetKey);
      const next = exists ? prev.filter((key) => key !== targetKey) : [targetKey, ...prev];
      const sanitized = sanitizeFavoriteKeys(next);
      void persistFavoriteKeys(sanitized);
      favoriteInitDoneRef.current = true;
      clearLegacyStoredFavoriteKeys();
      return sanitized;
    });
  };

  useEffect(() => {
    return () => {
      favoriteSaveControllerRef.current?.abort();
    };
  }, []);

  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  return { favoriteEmotes, favoriteKeySet, toggleFavorite };
};
