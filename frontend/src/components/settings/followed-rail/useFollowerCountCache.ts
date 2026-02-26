import { useCallback, useEffect, useRef, useState } from 'react';

import { buildApiUrl } from '../../../utils/api';
import type { FollowedChannelRailItem } from './types';

const FOLLOWER_COUNT_RETRY_COOLDOWN_MS = 60_000;

export const useFollowerCountCache = (channels: FollowedChannelRailItem[]) => {
  const [followerCountByChannelId, setFollowerCountByChannelId] = useState<Record<string, number>>({});
  const [loadingFollowerChannelIds, setLoadingFollowerChannelIds] = useState<Record<string, true>>({});

  const followerCountByChannelIdRef = useRef<Record<string, number>>({});
  const followerCountFetchInFlightRef = useRef<Set<string>>(new Set());
  const followerCountRetryAfterByChannelIdRef = useRef<Record<string, number>>({});

  useEffect(() => {
    followerCountByChannelIdRef.current = followerCountByChannelId;
  }, [followerCountByChannelId]);

  useEffect(() => {
    setFollowerCountByChannelId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const channel of channels) {
        const channelId = (channel.broadcaster_id || '').trim();
        if (channelId === '') continue;
        if (typeof channel.follower_count !== 'number') continue;
        if (next[channelId] === channel.follower_count) continue;
        next[channelId] = channel.follower_count;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [channels]);

  const ensureFollowerCount = useCallback(async (channel: FollowedChannelRailItem) => {
    const channelId = (channel.broadcaster_id || '').trim();
    if (channelId === '') return;

    const retryAfterAt = followerCountRetryAfterByChannelIdRef.current[channelId] || 0;
    if (retryAfterAt > Date.now()) return;

    if (typeof followerCountByChannelIdRef.current[channelId] === 'number') return;

    if (typeof channel.follower_count === 'number') {
      const immediateFollowerCount = channel.follower_count;
      setFollowerCountByChannelId((prev) => {
        if (prev[channelId] === immediateFollowerCount) return prev;
        return { ...prev, [channelId]: immediateFollowerCount };
      });
      return;
    }

    if (followerCountFetchInFlightRef.current.has(channelId)) return;

    followerCountFetchInFlightRef.current.add(channelId);
    setLoadingFollowerChannelIds((prev) => ({ ...prev, [channelId]: true }));

    try {
      const response = await fetch(
        buildApiUrl('/api/chat/user-profile/detail'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: channelId,
            login: channel.broadcaster_login,
            username: channel.broadcaster_login,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const followerCount =
        typeof payload?.follower_count === 'number'
          ? payload.follower_count
          : undefined;

      if (typeof followerCount === 'number') {
        delete followerCountRetryAfterByChannelIdRef.current[channelId];
        setFollowerCountByChannelId((prev) => {
          if (prev[channelId] === followerCount) return prev;
          return { ...prev, [channelId]: followerCount };
        });
      } else {
        followerCountRetryAfterByChannelIdRef.current[channelId] = Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
        setFollowerCountByChannelId((prev) => {
          if (!(channelId in prev)) return prev;
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    } catch {
      followerCountRetryAfterByChannelIdRef.current[channelId] = Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
    } finally {
      followerCountFetchInFlightRef.current.delete(channelId);
      setLoadingFollowerChannelIds((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });
    }
  }, []);

  const resolveFollowerCountLabel = useCallback((channel: FollowedChannelRailItem) => {
    const channelId = (channel.broadcaster_id || '').trim();
    const cached = channelId ? followerCountByChannelId[channelId] : undefined;
    const rawCount =
      typeof cached === 'number'
        ? cached
        : typeof channel.follower_count === 'number'
          ? channel.follower_count
          : undefined;

    if (typeof rawCount === 'number') {
      return rawCount.toLocaleString('ja-JP');
    }

    if (channelId && loadingFollowerChannelIds[channelId]) {
      return '取得中...';
    }

    return '不明';
  }, [followerCountByChannelId, loadingFollowerChannelIds]);

  return {
    ensureFollowerCount,
    resolveFollowerCountLabel,
  };
};
