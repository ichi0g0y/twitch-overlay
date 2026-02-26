import { useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl } from '../../../utils/api';
import { buildSectionsForGroup } from './sections';
import { clearStoredGroups, loadGroupsFromStorage, saveGroupsToStorage } from './storage';
import {
  buildLoadingGroup,
  collectMissingGroupIds,
  mergeGroupsIntoGroupCache,
  pickSeedGroupsFromCache,
} from './cache';
import { normalizeChannelLogin, parseEmoteGroupsFromResponse, sortGroups } from './parse';
import type { EmoteGroup, RenderGroup } from './types';
import { useEmoteFavorites } from './useEmoteFavorites';

export const useEmotePickerData = ({
  channelLogins,
  priorityChannelLogin,
}: {
  channelLogins: string[];
  priorityChannelLogin?: string;
}) => {
  const cacheRef = useRef<Record<string, EmoteGroup[]>>({});
  const groupCacheRef = useRef<Record<string, EmoteGroup>>({});
  const fetchSeqRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [keyword, setKeyword] = useState('');
  const [groups, setGroups] = useState<EmoteGroup[]>([]);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);
  const [needsFetch, setNeedsFetch] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const normalizedChannels = useMemo(() => {
    const set = new Set<string>();
    for (const channel of channelLogins) {
      const normalized = normalizeChannelLogin(channel);
      if (normalized !== '') set.add(normalized);
    }
    return Array.from(set).sort();
  }, [channelLogins]);

  const normalizedPriorityChannel = useMemo(
    () => (priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : ''),
    [priorityChannelLogin],
  );
  const requestChannel = useMemo(() => {
    if (normalizedPriorityChannel !== '') return normalizedPriorityChannel;
    if (normalizedChannels.length > 0) return normalizedChannels[0];
    return '';
  }, [normalizedChannels, normalizedPriorityChannel]);
  const requestKey = useMemo(() => `channel:${requestChannel || 'none'}`, [requestChannel]);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (requestChannel !== '') params.set('channels', requestChannel);
    if (normalizedPriorityChannel !== '') params.set('priority_channel', normalizedPriorityChannel);
    if (forceRefresh) params.set('refresh', 'true');
    const query = params.toString();
    return query === '' ? buildApiUrl('/api/emotes') : buildApiUrl(`/api/emotes?${query}`);
  }, [forceRefresh, normalizedPriorityChannel, requestChannel]);

  const favoriteApiUrl = useMemo(() => buildApiUrl('/api/emotes/favorites'), []);

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
      pickSeedGroupsFromCache(groupCacheRef.current, requestChannel, normalizedPriorityChannel),
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const reason = typeof data?.meta?.user_emotes_reason === 'string' ? data.meta.user_emotes_reason : '';
        setWarning(reason === 'missing_scope:user:read:emotes'
          ? '一部Emoteの取得に追加認証が必要です（user:read:emotes）。再ログインしてください。'
          : '');

        if (fetchSeqRef.current !== seq) return;
        const parsed = parseEmoteGroupsFromResponse(data, normalizedPriorityChannel);
        const sorted = sortGroups(parsed, normalizedPriorityChannel);
        cacheRef.current[requestKey] = sorted;
        mergeGroupsIntoGroupCache(groupCacheRef.current, sorted);
        if (parsed.length > 0) saveGroupsToStorage(requestKey, sorted);
        setGroups(sorted);
        setPendingGroupIds([]);
        setNeedsFetch(false);
      } catch (fetchError) {
        if (controller.signal.aborted || fetchSeqRef.current !== seq) return;
        console.error('[EmotePicker] Failed to fetch emotes:', fetchError);
        setError('エモート一覧の取得に失敗しました');
        setNeedsFetch(false);
        setPendingGroupIds([]);
      } finally {
        if (fetchSeqRef.current === seq) {
          setLoading(false);
          if (forceRefresh) setForceRefresh(false);
        }
      }
    };

    void fetchEmotes();
    return () => { controller.abort(); };
  }, [forceRefresh, needsFetch, normalizedPriorityChannel, open, requestKey, requestUrl]);

  const displayGroups = useMemo(() => {
    const next = [...groups];
    const existingIds = new Set(next.map((group) => group.id));
    for (const groupId of pendingGroupIds) {
      if (existingIds.has(groupId)) continue;
      const loadingGroup = buildLoadingGroup(groupId);
      if (loadingGroup) next.push(loadingGroup);
    }
    return sortGroups(next, normalizedPriorityChannel);
  }, [groups, normalizedPriorityChannel, pendingGroupIds]);

  const pendingGroupIdSet = useMemo(() => new Set(pendingGroupIds), [pendingGroupIds]);

  const filteredGroups = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return displayGroups
      .map((group) => {
        const isLoadingGroup = pendingGroupIdSet.has(group.id) && group.emotes.length === 0;
        if (isLoadingGroup) {
          return { ...group, sections: [], loading: true } satisfies RenderGroup;
        }
        const isPriorityGroup = group.priority || (normalizedPriorityChannel !== '' && group.channelLogin === normalizedPriorityChannel);
        const visibleEmotes = group.emotes.filter((emote) => emote.usable || isPriorityGroup);
        const emotes = normalizedKeyword === ''
          ? visibleEmotes
          : visibleEmotes.filter((emote) => emote.name.toLowerCase().includes(normalizedKeyword));
        return { ...group, sections: buildSectionsForGroup(group, emotes), loading: false } satisfies RenderGroup;
      })
      .filter((group) => group.loading || group.sections.length > 0);
  }, [displayGroups, keyword, normalizedPriorityChannel, pendingGroupIdSet]);

  const { favoriteEmotes, favoriteKeySet, toggleFavorite } = useEmoteFavorites({
    open,
    favoriteApiUrl,
    displayGroups,
    keyword,
  });

  const hasVisibleContent = favoriteEmotes.length > 0 || filteredGroups.length > 0;

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

  const scrollToGroup = (groupId: string) => {
    const container = scrollContainerRef.current;
    const section = sectionRefs.current[groupId];
    if (!container || !section) return;

    const containerRect = container.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const targetTop = container.scrollTop + (sectionRect.top - containerRect.top) - 4;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  };

  return {
    open,
    setOpen,
    loading,
    error,
    warning,
    keyword,
    setKeyword,
    favoriteEmotes,
    filteredGroups,
    favoriteKeySet,
    hasVisibleContent,
    scrollContainerRef,
    sectionRefs,
    handleRefresh,
    toggleFavorite,
    scrollToGroup,
  };
};
