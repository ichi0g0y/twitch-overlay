import { Globe2, Lock, LockOpen, RefreshCw, Smile, Sparkles, Star } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

import { buildApiUrl } from '../../utils/api';
import { Button } from '../ui/button';

type Emote = {
  id: string;
  name: string;
  url: string;
  source: 'channel' | 'special' | 'unlocked' | 'global' | 'learned';
  channelLogin?: string;
  usable: boolean;
  emoteType?: string;
  tier?: string;
};

type EmoteGroup = {
  id: string;
  label: string;
  source: 'channel' | 'special' | 'unlocked' | 'global' | 'learned';
  channelLogin?: string;
  channelAvatarUrl?: string;
  priority: boolean;
  emotes: Emote[];
};

type RenderGroup = EmoteGroup & {
  sections: EmoteSection[];
  loading: boolean;
};

type EmotePickerProps = {
  disabled?: boolean;
  channelLogins?: string[];
  priorityChannelLogin?: string;
  onSelect: (name: string, url: string) => void;
};

const DASHBOARD_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';
const EMOTE_CACHE_STORAGE_KEY = 'chat.emote_picker.cache.v10';
const EMOTE_FAVORITES_STORAGE_KEY_LEGACY = 'chat.emote_picker.favorites.v1';
const EMOTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EMOTE_CACHE_MAX_ENTRIES = 16;
const EMOTE_FAVORITES_MAX_ENTRIES = 200;
const FAVORITES_SECTION_KEY = 'favorites';

type StoredEmoteCacheEntry = {
  savedAt: number;
  groups: unknown[];
};

type StoredEmoteCache = Record<string, StoredEmoteCacheEntry>;

const normalizeChannelLogin = (raw: string) => {
  const normalized = raw.trim().replace(/^#/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(normalized)) return '';
  return normalized;
};

const resolveContextUsable = (
  usableFromServer?: boolean,
) => {
  // Rely on backend user-usable emote resolution.
  // If unavailable (older response), default to usable to avoid false locks.
  return usableFromServer ?? true;
};

const parseEmote = (raw: any): Emote | null => {
  if (!raw || typeof raw !== 'object') return null;

  const rawId = typeof raw.id === 'string'
    ? raw.id
    : (typeof raw.emote_id === 'string' ? raw.emote_id : '');
  const id = rawId.trim();
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const sourceRaw = typeof raw.source === 'string' ? raw.source : 'global';
  const source = sourceRaw === 'channel'
    || sourceRaw === 'special'
    || sourceRaw === 'unlocked'
    || sourceRaw === 'learned'
    ? sourceRaw
    : 'global';
  const rawChannelLogin = typeof raw.channel_login === 'string'
    ? raw.channel_login
    : (typeof raw.channelLogin === 'string' ? raw.channelLogin : '');
  const channelLogin = rawChannelLogin ? normalizeChannelLogin(rawChannelLogin) : '';
  const usableFromServer = typeof raw.usable === 'boolean'
    ? raw.usable
    : (typeof raw.is_usable === 'boolean' ? raw.is_usable : undefined);
  const rawEmoteType = typeof raw.emote_type === 'string'
    ? raw.emote_type
    : (typeof raw.emoteType === 'string' ? raw.emoteType : '');
  const emoteType = rawEmoteType.trim();
  const tier = typeof raw.tier === 'string' ? raw.tier.trim() : '';

  if (name === '' || url === '') return null;

  return {
    id,
    name,
    url,
    source,
    channelLogin: channelLogin || undefined,
    usable: resolveContextUsable(usableFromServer),
    emoteType: emoteType || undefined,
    tier: tier || undefined,
  };
};

const getEmoteFavoriteKey = (emote: Emote) => {
  if (emote.id.trim() !== '') return emote.id.trim();
  return `${emote.source}:${emote.channelLogin ?? ''}:${emote.name}:${emote.url}`;
};

const getEmoteUnavailableLabel = (emote: Emote) => {
  if (emote.source === 'channel') {
    return `${emote.name} (サブスク未加入/利用条件未達)`;
  }
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
    // Ignore storage errors (quota, private mode, etc.)
  }
};

const saveGroupsToStorage = (requestKey: string, groups: EmoteGroup[]) => {
  if (typeof window === 'undefined') return;
  const cache = readStoredEmoteCache();
  cache[requestKey] = { savedAt: Date.now(), groups };
  const orderedEntries = Object.entries(cache)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, EMOTE_CACHE_MAX_ENTRIES);
  writeStoredEmoteCache(Object.fromEntries(orderedEntries));
};

const loadGroupsFromStorage = (requestKey: string): EmoteGroup[] | null => {
  const cache = readStoredEmoteCache();
  const stored = cache[requestKey];
  if (!stored) return null;
  return parseEmoteGroupsFromResponse({ data: { groups: stored.groups } });
};

const clearStoredGroups = (requestKey: string) => {
  const cache = readStoredEmoteCache();
  if (!(requestKey in cache)) return;
  delete cache[requestKey];
  writeStoredEmoteCache(cache);
};

const sanitizeFavoriteKeys = (keys: unknown): string[] => {
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

const readLegacyStoredFavoriteKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(EMOTE_FAVORITES_STORAGE_KEY_LEGACY);
    if (!raw) return [];
    return sanitizeFavoriteKeys(JSON.parse(raw));
  } catch {
    return [];
  }
};

const clearLegacyStoredFavoriteKeys = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EMOTE_FAVORITES_STORAGE_KEY_LEGACY);
  } catch {
    // Ignore storage errors.
  }
};

const parseFavoriteKeysFromResponse = (raw: any): string[] => {
  return sanitizeFavoriteKeys(raw?.data?.keys);
};

const sortGroups = (groups: EmoteGroup[], priorityChannelLogin?: string) => {
  const normalizedPriority = priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : '';

  return [...groups].sort((a, b) => {
    const aPriority = a.priority || (normalizedPriority !== '' && a.channelLogin === normalizedPriority);
    const bPriority = b.priority || (normalizedPriority !== '' && b.channelLogin === normalizedPriority);
    const sourceOrder = (source: EmoteGroup['source']) => {
      if (source === 'channel') return 0;
      if (source === 'special') return 1;
      if (source === 'unlocked') return 2;
      if (source === 'global') return 3;
      return 4;
    };

    return Number(bPriority) - Number(aPriority)
      || sourceOrder(a.source) - sourceOrder(b.source)
      || a.label.localeCompare(b.label, 'en');
  });
};

const parseEmoteGroupsFromResponse = (raw: any, priorityChannelLogin?: string): EmoteGroup[] => {
  const groupList = raw?.data?.groups;
  if (Array.isArray(groupList)) {
    const groups: EmoteGroup[] = [];
    for (const group of groupList) {
      if (!group || typeof group !== 'object') continue;

      const id = typeof group.id === 'string' ? group.id : '';
      const label = typeof group.label === 'string' ? group.label : '';
      const sourceRaw = typeof group.source === 'string' ? group.source : 'global';
      const source = sourceRaw === 'channel'
        || sourceRaw === 'special'
        || sourceRaw === 'unlocked'
        || sourceRaw === 'learned'
        ? sourceRaw
        : 'global';
      const rawChannelLogin = typeof group.channel_login === 'string'
        ? group.channel_login
        : (typeof group.channelLogin === 'string' ? group.channelLogin : '');
      const channelLogin = rawChannelLogin ? normalizeChannelLogin(rawChannelLogin) : '';
      const rawChannelAvatarUrl = typeof group.channel_avatar_url === 'string'
        ? group.channel_avatar_url
        : (typeof group.channelAvatarUrl === 'string' ? group.channelAvatarUrl : '');
      const channelAvatarUrl = rawChannelAvatarUrl.trim();
      const priority = group.priority === true;

      const emotes = Array.isArray(group.emotes)
        ? group.emotes
          .map((emote) => parseEmote(emote))
          .filter((emote): emote is Emote => emote !== null)
        : [];

      if (id === '' || label === '' || emotes.length === 0) continue;

      groups.push({
        id,
        label,
        source,
        channelLogin: channelLogin || undefined,
        channelAvatarUrl: channelAvatarUrl || undefined,
        priority,
        emotes,
      });
    }

    return sortGroups(groups, priorityChannelLogin);
  }

  const flatList = raw?.data?.emotes;
  if (!Array.isArray(flatList)) return [];

  const emotes = flatList
    .map((emote) => parseEmote(emote))
    .filter((emote): emote is Emote => emote !== null);

  if (emotes.length === 0) return [];

  return [{
    id: 'all',
    label: 'すべて',
    source: 'global',
    priority: false,
    emotes,
  }];
};

type EmoteBucket = 'free' | 'tier1' | 'tier2' | 'tier3' | 'unlock' | 'other';

type EmoteSection = {
  key: string;
  label: string;
  emotes: Emote[];
};

type EmoteSubSection = {
  key: string;
  label: string;
  emotes: Emote[];
};

const normalizeEmoteType = (value?: string) => {
  return (value ?? '').trim().toLowerCase().replace(/[- ]/g, '_');
};

const parseTier = (value?: string): number | null => {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const classifyEmoteBucket = (emote: Emote): EmoteBucket => {
  const type = normalizeEmoteType(emote.emoteType);

  if (type === 'follower' || type === 'followers') {
    return 'free';
  }
  if (type === 'subscriptions' || type === 'subscription' || type === 'subscriber' || type === 'subscribers') {
    const tier = parseTier(emote.tier);
    if (tier === 1000) return 'tier1';
    if (tier === 2000) return 'tier2';
    if (tier === 3000) return 'tier3';
    return 'other';
  }
  if (
    emote.source === 'special'
    || type === 'reward'
    || type === 'rewards'
    || type === 'channel_points'
    || type === 'channelpoints'
    || type === 'unlock'
    || type === 'unlocked'
    || type === 'bitstier'
    || type === 'bits_tier'
    || type === 'hypetrain'
    || type === 'hype_train'
    || type === 'limitedtime'
    || type === 'limited_time'
    || type === 'prime'
    || type === 'turbo'
    || type === 'twofactor'
  ) {
    return 'unlock';
  }
  if (emote.source === 'unlocked') {
    return 'unlock';
  }
  return 'other';
};

const bucketOrder: EmoteBucket[] = ['free', 'tier1', 'tier2', 'tier3', 'unlock', 'other'];

const bucketMeta: Record<EmoteBucket, Omit<EmoteSection, 'key' | 'emotes'>> = {
  free: {
    label: 'Free',
  },
  tier1: {
    label: 'Tier1',
  },
  tier2: {
    label: 'Tier2',
  },
  tier3: {
    label: 'Tier3',
  },
  unlock: {
    label: 'Unlock/Special',
  },
  other: {
    label: 'Other',
  },
};

const buildSectionsForGroup = (group: EmoteGroup, emotes: Emote[]): EmoteSection[] => {
  if (group.source === 'global') {
    const sorted = [...emotes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    if (sorted.length === 0) return [];
    return [{
      key: 'global',
      label: 'Global A-Z',
      emotes: sorted,
    }];
  }

  const bucketed: Record<EmoteBucket, Emote[]> = {
    free: [],
    tier1: [],
    tier2: [],
    tier3: [],
    unlock: [],
    other: [],
  };

  for (const emote of emotes) {
    const bucket = classifyEmoteBucket(emote);
    bucketed[bucket].push(emote);
  }

  return bucketOrder
    .filter((bucket) => bucketed[bucket].length > 0)
    .map((bucket) => ({
      key: bucket,
      ...bucketMeta[bucket],
      emotes: [...bucketed[bucket]].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    }));
};

const subsectionSortIndex = (sectionKey: string, label: string): number => {
  const freeOrder = ['Follower', 'Free Unlock', 'Free Other'];
  const unlockOrder = [
    'Prime',
    'Turbo',
    'Two-Factor',
    'Channel Points',
    'Reward',
    'Bits Tier',
    'Hype Train',
    'Limited Time',
    'Special',
    'Unlock',
  ];

  if (sectionKey === 'free') {
    const idx = freeOrder.indexOf(label);
    return idx >= 0 ? idx : 99;
  }
  if (sectionKey === 'unlock') {
    const idx = unlockOrder.indexOf(label);
    return idx >= 0 ? idx : 99;
  }
  return 99;
};

const resolveSubSectionLabel = (sectionKey: string, emote: Emote): string => {
  const type = normalizeEmoteType(emote.emoteType);
  if (sectionKey === 'global') return 'Global';
  if (sectionKey === 'tier1') return 'Tier1';
  if (sectionKey === 'tier2') return 'Tier2';
  if (sectionKey === 'tier3') return 'Tier3';

  if (sectionKey === 'free') {
    if (type === 'follower' || type === 'followers') return 'Follower';
    if (emote.source === 'unlocked') return 'Free Unlock';
    return 'Free Other';
  }

  if (sectionKey === 'unlock') {
    if (type === 'prime') return 'Prime';
    if (type === 'turbo') return 'Turbo';
    if (type === 'twofactor') return 'Two-Factor';
    if (type === 'channel_points' || type === 'channelpoints') return 'Channel Points';
    if (type === 'reward' || type === 'rewards') return 'Reward';
    if (type === 'bitstier' || type === 'bits_tier') return 'Bits Tier';
    if (type === 'hypetrain' || type === 'hype_train') return 'Hype Train';
    if (type === 'limitedtime' || type === 'limited_time') return 'Limited Time';
    if (emote.source === 'special') return 'Special';
    return 'Unlock';
  }

  return 'Other';
};

const buildSubSectionsForSection = (section: EmoteSection): EmoteSubSection[] => {
  if (section.key === 'global') {
    return [{
      key: 'global',
      label: 'Global',
      emotes: section.emotes,
    }];
  }

  const byLabel = new Map<string, Emote[]>();
  for (const emote of section.emotes) {
    const label = resolveSubSectionLabel(section.key, emote);
    const current = byLabel.get(label);
    if (current) {
      current.push(emote);
    } else {
      byLabel.set(label, [emote]);
    }
  }

  return Array.from(byLabel.entries())
    .sort((a, b) => {
      const orderDiff = subsectionSortIndex(section.key, a[0]) - subsectionSortIndex(section.key, b[0]);
      if (orderDiff !== 0) return orderDiff;
      return a[0].localeCompare(b[0], 'en', { sensitivity: 'base' });
    })
    .map(([label, emotes]) => ({
      key: `${section.key}:${label.toLowerCase().replace(/\s+/g, '_')}`,
      label,
      emotes: [...emotes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    }));
};

const groupHeaderClass = (group: EmoteGroup): string => {
  if (group.channelLogin) {
    return 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100';
  }
  if (group.source === 'global') {
    return 'bg-slate-200 text-slate-800 dark:bg-slate-700/80 dark:text-slate-100';
  }
  if (group.source === 'unlocked') {
    return 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-100';
  }
  if (group.source === 'special') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/70 dark:text-gray-100';
};

const cloneGroup = (group: EmoteGroup): EmoteGroup => {
  return {
    ...group,
    emotes: [...group.emotes],
  };
};

const mergeGroupsIntoGroupCache = (
  cache: Record<string, EmoteGroup>,
  groups: EmoteGroup[],
) => {
  for (const group of groups) {
    if (!group.id) continue;
    cache[group.id] = cloneGroup(group);
  }
};

const pickSeedGroupsFromCache = (
  cache: Record<string, EmoteGroup>,
  requestChannel: string,
  priorityChannel: string,
): EmoteGroup[] => {
  const selected: EmoteGroup[] = [];
  const seen = new Set<string>();
  const include = (groupId: string) => {
    if (groupId === '' || seen.has(groupId)) return;
    const group = cache[groupId];
    if (!group) return;
    selected.push(cloneGroup(group));
    seen.add(groupId);
  };

  for (const group of Object.values(cache)) {
    if (group.source !== 'channel') {
      include(group.id);
    }
  }

  if (priorityChannel !== '') {
    include(`channel:${priorityChannel}`);
  }
  if (requestChannel !== '') {
    include(`channel:${requestChannel}`);
  }

  return selected;
};

const collectMissingGroupIds = (requestChannel: string, groups: EmoteGroup[]): string[] => {
  const existingIds = new Set(groups.map((group) => group.id));
  const missing: string[] = [];

  if (!existingIds.has('global')) {
    missing.push('global');
  }
  if (!existingIds.has('unlocked')) {
    missing.push('unlocked');
  }
  if (requestChannel !== '') {
    const channelGroupId = `channel:${requestChannel}`;
    if (!existingIds.has(channelGroupId)) {
      missing.push(channelGroupId);
    }
  }

  return missing;
};

const buildLoadingGroup = (groupId: string): EmoteGroup | null => {
  if (groupId === 'global') {
    return {
      id: 'global',
      label: 'グローバル',
      source: 'global',
      priority: false,
      emotes: [],
    };
  }
  if (groupId === 'unlocked') {
    return {
      id: 'unlocked',
      label: 'アンロック済み',
      source: 'unlocked',
      priority: false,
      emotes: [],
    };
  }
  if (groupId.startsWith('channel:')) {
    const channelLogin = groupId.slice('channel:'.length).trim().toLowerCase();
    if (channelLogin === '') return null;
    return {
      id: groupId,
      label: `#${channelLogin}`,
      source: 'channel',
      channelLogin,
      priority: false,
      emotes: [],
    };
  }
  return null;
};

export const EmotePicker: React.FC<EmotePickerProps> = ({
  disabled = false,
  channelLogins = [],
  priorityChannelLogin,
  onSelect,
}) => {
  const cacheRef = useRef<Record<string, EmoteGroup[]>>({});
  const groupCacheRef = useRef<Record<string, EmoteGroup>>({});
  const fetchSeqRef = useRef(0);
  const favoriteInitDoneRef = useRef(false);
  const favoriteSaveControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [keyword, setKeyword] = useState('');
  const [groups, setGroups] = useState<EmoteGroup[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);
  const [needsFetch, setNeedsFetch] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const normalizedChannels = useMemo(() => {
    const set = new Set<string>();
    for (const channel of channelLogins) {
      const normalized = normalizeChannelLogin(channel);
      if (normalized !== '') {
        set.add(normalized);
      }
    }
    return Array.from(set).sort();
  }, [channelLogins]);

  const normalizedPriorityChannel = useMemo(() => {
    return priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : '';
  }, [priorityChannelLogin]);

  const requestChannel = useMemo(() => {
    if (normalizedPriorityChannel !== '') return normalizedPriorityChannel;
    if (normalizedChannels.length > 0) return normalizedChannels[0];
    return '';
  }, [normalizedChannels, normalizedPriorityChannel]);

  const requestKey = useMemo(() => {
    return `channel:${requestChannel || 'none'}`;
  }, [requestChannel]);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (requestChannel !== '') {
      params.set('channels', requestChannel);
    }
    if (normalizedPriorityChannel !== '') {
      params.set('priority_channel', normalizedPriorityChannel);
    }
    if (forceRefresh) {
      params.set('refresh', 'true');
    }

    const queryString = params.toString();
    if (queryString === '') {
      return buildApiUrl('/api/emotes');
    }
    return buildApiUrl(`/api/emotes?${queryString}`);
  }, [forceRefresh, normalizedPriorityChannel, requestChannel]);

  const favoriteApiUrl = useMemo(() => {
    return buildApiUrl('/api/emotes/favorites');
  }, []);

  useEffect(() => {
    setKeyword('');
    setError('');
    setWarning('');

    const cached = cacheRef.current[requestKey];
    if (cached) {
      const sorted = sortGroups(cached, normalizedPriorityChannel);
      mergeGroupsIntoGroupCache(groupCacheRef.current, sorted);
      setGroups(sorted);
      setPendingGroupIds(collectMissingGroupIds(requestChannel, sorted));
      setNeedsFetch(true);
      return;
    }

    const stored = loadGroupsFromStorage(requestKey);
    if (stored) {
      cacheRef.current[requestKey] = stored;
      const sorted = sortGroups(stored, normalizedPriorityChannel);
      mergeGroupsIntoGroupCache(groupCacheRef.current, sorted);
      setGroups(sorted);
      setPendingGroupIds(collectMissingGroupIds(requestChannel, sorted));
      setNeedsFetch(true);
      return;
    }

    const seeded = sortGroups(
      pickSeedGroupsFromCache(
        groupCacheRef.current,
        requestChannel,
        normalizedPriorityChannel,
      ),
      normalizedPriorityChannel,
    );
    setGroups(seeded);
    setPendingGroupIds(collectMissingGroupIds(requestChannel, seeded));
    setNeedsFetch(true);
  }, [normalizedPriorityChannel, requestChannel, requestKey]);

  useEffect(() => {
    if (!open || (!needsFetch && !forceRefresh)) return;

    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;
    const controller = new AbortController();

    const fetchEmotes = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(requestUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const reason = typeof data?.meta?.user_emotes_reason === 'string'
          ? data.meta.user_emotes_reason
          : '';
        if (reason === 'missing_scope:user:read:emotes') {
          setWarning('一部Emoteの取得に追加認証が必要です（user:read:emotes）。再ログインしてください。');
        } else {
          setWarning('');
        }
        if (fetchSeqRef.current !== seq) return;
        const parsed = parseEmoteGroupsFromResponse(data, normalizedPriorityChannel);
        const sorted = sortGroups(parsed, normalizedPriorityChannel);
        cacheRef.current[requestKey] = sorted;
        mergeGroupsIntoGroupCache(groupCacheRef.current, sorted);
        if (parsed.length > 0) {
          saveGroupsToStorage(requestKey, sorted);
        }
        setGroups(sorted);
        setPendingGroupIds([]);
        setNeedsFetch(false);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        if (fetchSeqRef.current !== seq) return;
        console.error('[EmotePicker] Failed to fetch emotes:', fetchError);
        setError('エモート一覧の取得に失敗しました');
        setNeedsFetch(false);
        setPendingGroupIds([]);
      } finally {
        if (fetchSeqRef.current === seq) {
          setLoading(false);
          if (forceRefresh) {
            setForceRefresh(false);
          }
        }
      }
    };

    void fetchEmotes();
    return () => {
      controller.abort();
    };
  }, [forceRefresh, needsFetch, normalizedPriorityChannel, open, requestKey, requestUrl]);

  useEffect(() => {
    if (!open || favoriteInitDoneRef.current) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadFavoriteKeys = async () => {
      const legacyKeys = readLegacyStoredFavoriteKeys();
      try {
        const response = await fetch(favoriteApiUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
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
              headers: {
                'Content-Type': 'application/json',
              },
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

  const displayGroups = useMemo(() => {
    const next = [...groups];
    const existingIds = new Set(next.map((group) => group.id));
    for (const groupId of pendingGroupIds) {
      if (existingIds.has(groupId)) continue;
      const loadingGroup = buildLoadingGroup(groupId);
      if (!loadingGroup) continue;
      next.push(loadingGroup);
    }
    return sortGroups(next, normalizedPriorityChannel);
  }, [groups, normalizedPriorityChannel, pendingGroupIds]);

  const pendingGroupIdSet = useMemo(() => {
    return new Set(pendingGroupIds);
  }, [pendingGroupIds]);

  const favoriteKeySet = useMemo(() => {
    return new Set(favoriteKeys);
  }, [favoriteKeys]);

  const usableEmoteMap = useMemo(() => {
    const map = new Map<string, Emote>();
    for (const group of displayGroups) {
      for (const emote of group.emotes) {
        if (!emote.usable) continue;
        const key = getEmoteFavoriteKey(emote);
        if (!map.has(key)) {
          map.set(key, emote);
        }
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

  const filteredGroups = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return displayGroups
      .map((group) => {
        const isLoadingGroup = pendingGroupIdSet.has(group.id) && group.emotes.length === 0;
        if (isLoadingGroup) {
          return {
            ...group,
            sections: [],
            loading: true,
          } satisfies RenderGroup;
        }
        const isPriorityGroup = group.priority
          || (normalizedPriorityChannel !== '' && group.channelLogin === normalizedPriorityChannel);
        const visibleEmotes = group.emotes.filter((emote) => emote.usable || isPriorityGroup);
        const emotes = normalizedKeyword === ''
          ? visibleEmotes
          : visibleEmotes.filter((emote) => emote.name.toLowerCase().includes(normalizedKeyword));
        const sections = buildSectionsForGroup(group, emotes);
        return {
          ...group,
          sections,
          loading: false,
        } satisfies RenderGroup;
      })
      .filter((group) => group.loading || group.sections.length > 0);
  }, [displayGroups, keyword, normalizedPriorityChannel, pendingGroupIdSet]);

  const handleRefresh = () => {
    delete cacheRef.current[requestKey];
    clearStoredGroups(requestKey);
    setForceRefresh(true);
    setNeedsFetch(true);
    setKeyword('');
    setError('');
    setWarning('');
    setPendingGroupIds(collectMissingGroupIds(requestChannel, groups));
  };

  const persistFavoriteKeys = async (keys: string[]) => {
    favoriteSaveControllerRef.current?.abort();
    const controller = new AbortController();
    favoriteSaveControllerRef.current = controller;
    try {
      const response = await fetch(favoriteApiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keys }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (saveError) {
      if (controller.signal.aborted) return;
      console.warn('[EmotePicker] Failed to save favorite keys to DB:', saveError);
    }
  };

  const toggleFavorite = (emote: Emote) => {
    if (!emote.usable) return;
    const targetKey = getEmoteFavoriteKey(emote);
    setFavoriteKeys((prev) => {
      const exists = prev.includes(targetKey);
      const next = exists
        ? prev.filter((key) => key !== targetKey)
        : [targetKey, ...prev];
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

  const scrollToGroup = (groupId: string) => {
    const container = scrollContainerRef.current;
    const section = sectionRefs.current[groupId];
    if (!container || !section) return;

    const containerRect = container.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const targetTop = container.scrollTop + (sectionRect.top - containerRect.top) - 4;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  };

  const renderGroupNavAvatar = (group: RenderGroup) => {
    if (group.channelAvatarUrl) {
      return (
        <img
          src={group.channelAvatarUrl}
          alt={`${group.label} avatar`}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      );
    }
    if (group.source === 'unlocked') {
      return <LockOpen className="h-3.5 w-3.5" />;
    }
    if (group.source === 'global') {
      return <Globe2 className="h-3.5 w-3.5" />;
    }
    if (group.source === 'special') {
      return <Sparkles className="h-3.5 w-3.5" />;
    }
    return (
      <span className="text-[10px] font-semibold leading-none">
        {(group.label || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  };

  const renderEmoteCell = (
    emote: Emote,
    cellKey: string,
    options?: { showFavoriteToggle?: boolean },
  ) => {
    const showFavoriteToggle = options?.showFavoriteToggle ?? true;
    const favoriteKey = getEmoteFavoriteKey(emote);
    const isFavorite = favoriteKeySet.has(favoriteKey);
    const canToggleFavorite = emote.usable && showFavoriteToggle;

    return (
      <div key={cellKey} className="group/emote relative inline-flex h-8 w-8 items-center justify-center">
        <button
          type="button"
          disabled={!emote.usable}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (!emote.usable) return;
            onSelect(emote.name, emote.url);
          }}
          className={`relative inline-flex h-8 w-8 items-center justify-center rounded border ${
            emote.usable
              ? 'border-transparent hover:bg-white/80 dark:hover:bg-gray-800/70'
              : 'cursor-not-allowed border-transparent opacity-60'
          }`}
          title={emote.usable ? emote.name : getEmoteUnavailableLabel(emote)}
          aria-label={emote.usable ? emote.name : getEmoteUnavailableLabel(emote)}
        >
          <img src={emote.url} alt={emote.name} className="h-7 w-7 object-contain" loading="lazy" />
          {!emote.usable && (
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center text-gray-500/80 dark:text-gray-300/70">
              <Lock className="h-2.5 w-2.5 fill-current opacity-80" />
            </span>
          )}
        </button>
        {canToggleFavorite && (
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleFavorite(emote);
            }}
            className={`pointer-events-none absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center opacity-0 transition-all group-hover/emote:pointer-events-auto group-hover/emote:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 ${
              isFavorite
                ? 'text-amber-500 dark:text-amber-300'
                : 'text-gray-400 hover:text-amber-500 dark:text-gray-500 dark:hover:text-amber-300'
            }`}
            aria-label={isFavorite ? `${emote.name} をお気に入り解除` : `${emote.name} をお気に入り`}
            title={isFavorite ? 'お気に入り解除' : 'お気に入り'}
          >
            <Star className={`h-2.5 w-2.5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        )}
      </div>
    );
  };

  const hasVisibleContent = favoriteEmotes.length > 0 || filteredGroups.length > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 w-9 px-0"
          aria-label="エモートを選択"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <Smile className="h-4 w-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-[1800] w-[360px] rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="エモート検索"
                style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:ring-offset-gray-900 dark:focus-visible:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label="エモート一覧を更新"
                title="エモート一覧を更新"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading && filteredGroups.length === 0 && (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">読み込み中...</p>
            )}

            {error !== '' && filteredGroups.length === 0 && (
              <p className="py-6 text-center text-xs text-red-500 dark:text-red-300">{error}</p>
            )}

            {warning !== '' && (
              <p className="rounded border border-amber-300/60 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {warning}
              </p>
            )}

            {error !== '' && filteredGroups.length > 0 && (
              <p className="rounded border border-red-300/60 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </p>
            )}

            {!loading && error === '' && !hasVisibleContent && (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">該当するエモートがありません</p>
            )}

            {hasVisibleContent && (
              <div className="flex items-start gap-2">
                <div ref={scrollContainerRef} className="max-h-72 flex-1 space-y-2 overflow-y-auto pr-1">
                  {favoriteEmotes.length > 0 && (
                    <section
                      key={FAVORITES_SECTION_KEY}
                      ref={(node) => {
                        sectionRefs.current[FAVORITES_SECTION_KEY] = node;
                      }}
                      className="space-y-1"
                    >
                      <div className="sticky top-0 z-10 w-full rounded-md bg-amber-100 px-2.5 py-2 text-xs font-semibold text-amber-900 backdrop-blur dark:bg-amber-500/20 dark:text-amber-100">
                        <div className="flex min-h-5 items-center gap-2">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span className="truncate">お気に入り</span>
                          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-400/30 dark:text-amber-100">
                            {favoriteEmotes.length}
                          </span>
                        </div>
                      </div>
                      <div className="grid justify-items-center gap-1 [grid-template-columns:repeat(auto-fill,minmax(2rem,1fr))]">
                          {favoriteEmotes.map((emote) => (
                            renderEmoteCell(
                              emote,
                              `${FAVORITES_SECTION_KEY}:${emote.id}:${emote.name}:${emote.url}`,
                              { showFavoriteToggle: false },
                            )
                          ))}
                        </div>
                    </section>
                  )}
                  {filteredGroups.map((group) => (
                    <section
                      key={group.id}
                      ref={(node) => {
                        sectionRefs.current[group.id] = node;
                      }}
                      className="space-y-1"
                    >
                      <div className={`sticky top-0 z-10 w-full rounded-md px-2.5 py-2 text-xs font-semibold backdrop-blur ${groupHeaderClass(group)}`}>
                        <div className="flex min-h-5 items-center gap-2">
                          {group.channelLogin && group.channelAvatarUrl && (
                            <img
                              src={group.channelAvatarUrl}
                              alt={`${group.label} avatar`}
                              className="h-5 w-5 rounded-full object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="truncate">{group.label}</span>
                          {group.loading && (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-gray-900/60 dark:text-blue-200">
                              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                              読み込み中
                            </span>
                          )}
                        </div>
                      </div>
                      {group.loading ? (
                        <div className="space-y-1.5">
                          <div className="rounded-md border border-dashed border-gray-200/80 bg-gray-50/80 p-2 dark:border-gray-700/80 dark:bg-gray-800/40">
                            <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="mt-2 grid grid-cols-6 gap-1">
                              {Array.from({ length: 12 }).map((_, idx) => (
                                <span
                                  key={`${group.id}:loading:${idx}`}
                                  className="inline-block h-8 w-8 animate-pulse rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {group.sections.map((section) => {
                            const subSections = buildSubSectionsForSection(section);
                            const hasMultipleSubSections = subSections.length > 1;

                            return (
                              <div key={`${group.id}:${section.key}`} className="space-y-1">
                                {hasMultipleSubSections && (
                                  <div className="mb-1 flex items-center justify-start gap-1.5">
                                    <span className="inline-flex px-1 py-0 text-[10px] font-medium leading-none text-gray-400 dark:text-gray-500">
                                      {section.label}
                                    </span>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      {section.emotes.length}
                                    </span>
                                  </div>
                                )}
                                {subSections.map((subSection) => (
                                  <div
                                    key={`${group.id}:${section.key}:${subSection.key}`}
                                    className="space-y-1 rounded-md border border-gray-200/70 bg-gray-50/80 p-1.5 dark:border-gray-700/70 dark:bg-gray-800/40"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                                      <span>{subSection.label}</span>
                                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                        {subSection.emotes.length}
                                      </span>
                                    </div>
                                    <div className="grid justify-items-center gap-1 [grid-template-columns:repeat(auto-fill,minmax(2rem,1fr))]">
                                      {subSection.emotes.map((emote) => (
                                        renderEmoteCell(
                                          emote,
                                          `${group.id}:${section.key}:${subSection.key}:${emote.id}:${emote.name}:${emote.url}`,
                                        )
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
                <div className="max-h-72 w-9 shrink-0 space-y-1 overflow-y-auto pl-0.5">
                  {favoriteEmotes.length > 0 && (
                    <button
                      key={`jump:${FAVORITES_SECTION_KEY}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        scrollToGroup(FAVORITES_SECTION_KEY);
                      }}
                      className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
                      aria-label="お気に入りセクションへ移動"
                      title="お気に入りセクションへ移動"
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                  {filteredGroups.map((group) => (
                    <button
                      key={`jump:${group.id}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        scrollToGroup(group.id);
                      }}
                      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border text-gray-700 transition-colors hover:bg-white hover:text-gray-900 dark:text-gray-200 dark:hover:bg-gray-700 ${
                        group.loading
                          ? 'border-blue-300 bg-blue-100 ring-1 ring-blue-300/80 dark:border-blue-500/60 dark:bg-blue-500/20 dark:ring-blue-500/40'
                          : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800'
                      }`}
                      aria-label={`${group.label} セクションへ移動${group.loading ? '（読み込み中）' : ''}`}
                      title={`${group.label} セクションへ移動${group.loading ? '（読み込み中）' : ''}`}
                    >
                      {renderGroupNavAvatar(group)}
                      {group.loading && (
                        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-500/70 dark:bg-blue-900/80 dark:text-blue-200">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
