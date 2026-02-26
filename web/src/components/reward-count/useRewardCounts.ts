import { useEffect, useMemo, useRef, useState } from 'react';
import { getWebSocketClient } from '../../utils/websocket';
import { buildApiUrl } from '../../utils/api';
import type { RewardCount, RewardCountItemState } from '../../types';

interface UseRewardCountsOptions {
  isEnabled: boolean;
  groupId?: string;
  playAlertSound: () => void;
}

interface UseRewardCountsResult {
  countArray: RewardCountItemState[];
}

export function useRewardCounts({
  isEnabled,
  groupId,
  playAlertSound,
}: UseRewardCountsOptions): UseRewardCountsResult {
  const [counts, setCounts] = useState<Map<string, RewardCountItemState>>(new Map());
  const groupRewardIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isEnabled || !groupId) {
      groupRewardIdsRef.current = new Set();
      return;
    }

    const fetchGroupRewardIds = async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}`));
        if (!response.ok) return;

        const group = await response.json();
        const newRewardIds = new Set<string>(group.reward_ids || []);
        groupRewardIdsRef.current = newRewardIds;
        console.log('🔄 Group reward IDs updated:', group.reward_ids?.length || 0);
      } catch (error) {
        console.error('Failed to fetch group reward IDs:', error);
        groupRewardIdsRef.current = new Set();
      }
    };

    fetchGroupRewardIds();
    const intervalId = setInterval(fetchGroupRewardIds, 30000);
    return () => clearInterval(intervalId);
  }, [isEnabled, groupId]);

  useEffect(() => {
    if (!isEnabled) return;

    const fetchCounts = async () => {
      try {
        const url = groupId
          ? buildApiUrl(`/api/twitch/reward-groups/${groupId}/counts`)
          : buildApiUrl('/api/twitch/reward-counts');

        const response = await fetch(url);
        if (!response.ok) return;

        const data: RewardCount[] = await response.json();
        const newCounts = new Map<string, RewardCountItemState>();
        data.forEach((item) => {
          if (item.count > 0) {
            newCounts.set(item.reward_id, {
              rewardId: item.reward_id,
              count: item.count,
              userNames: item.user_names || [],
              displayName: item.display_name || item.title || '未設定',
              state: 'entering',
            });
          }
        });

        setCounts(newCounts);
      } catch (error) {
        console.error('Failed to fetch reward counts:', error);
      }
    };

    fetchCounts();
  }, [isEnabled, groupId]);

  useEffect(() => {
    if (!isEnabled) return;

    const wsClient = getWebSocketClient();

    const unsubCountUpdated = wsClient.on('reward_count_updated', (data: RewardCount) => {
      console.log('📊 Reward count updated:', data);

      if (groupId) {
        if (groupRewardIdsRef.current.size === 0) {
          console.log('⏳ Ignoring reward: group reward IDs not loaded yet', data.reward_id);
          return;
        }
        if (!groupRewardIdsRef.current.has(data.reward_id)) {
          console.log('🚫 Ignoring reward: not in selected group', data.reward_id);
          return;
        }
      }

      setCounts((prev) => {
        const newCounts = new Map(prev);
        if (data.count === 0) {
          const existing = newCounts.get(data.reward_id);
          if (existing) {
            newCounts.set(data.reward_id, { ...existing, state: 'exiting' });
            setTimeout(() => {
              setCounts((current) => {
                const updated = new Map(current);
                updated.delete(data.reward_id);
                return updated;
              });
            }, 300);
          }
          return newCounts;
        }

        playAlertSound();
        const existing = newCounts.get(data.reward_id);
        if (existing) {
          newCounts.set(data.reward_id, {
            ...existing,
            count: data.count,
            userNames: data.user_names || [],
            displayName: data.display_name || data.title || existing.displayName,
          });
        } else {
          newCounts.set(data.reward_id, {
            rewardId: data.reward_id,
            count: data.count,
            userNames: data.user_names || [],
            displayName: data.display_name || data.title || '未設定',
            state: 'entering',
          });
        }
        return newCounts;
      });
    });

    const unsubCountsReset = wsClient.on('reward_counts_reset', () => {
      console.log('📊 All reward counts reset');
      setCounts((prev) => {
        const newCounts = new Map(prev);
        newCounts.forEach((item, key) => {
          newCounts.set(key, { ...item, state: 'exiting' });
        });
        return newCounts;
      });
      setTimeout(() => {
        setCounts(new Map());
      }, 300);
    });

    return () => {
      unsubCountUpdated();
      unsubCountsReset();
    };
  }, [groupId, isEnabled, playAlertSound]);

  useEffect(() => {
    const enteringItems = Array.from(counts.entries()).filter(([, item]) => item.state === 'entering');
    if (enteringItems.length === 0) return;

    const timer = setTimeout(() => {
      setCounts((current) => {
        const updated = new Map(current);
        enteringItems.forEach(([rewardId]) => {
          const item = updated.get(rewardId);
          if (item && item.state === 'entering') {
            updated.set(rewardId, { ...item, state: 'visible' });
          }
        });
        return updated;
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [counts]);

  useEffect(() => {
    if (!isEnabled) return;

    const intervalId = setInterval(async () => {
      try {
        const url = groupId
          ? buildApiUrl(`/api/twitch/reward-groups/${groupId}/counts`)
          : buildApiUrl('/api/twitch/reward-counts');

        const response = await fetch(url);
        if (!response.ok) return;

        const data: RewardCount[] = await response.json();
        setCounts((prev) => {
          const newCounts = new Map(prev);

          data.forEach((item) => {
            if (groupId && groupRewardIdsRef.current.size > 0 && !groupRewardIdsRef.current.has(item.reward_id)) {
              return;
            }

            if (item.count > 0) {
              const existing = newCounts.get(item.reward_id);
              if (!existing) {
                console.log('🔄 Polling: Adding missing reward', item.reward_id);
                newCounts.set(item.reward_id, {
                  rewardId: item.reward_id,
                  count: item.count,
                  userNames: item.user_names || [],
                  displayName: item.display_name || item.title || '未設定',
                  state: 'entering',
                });
              } else if (existing.count !== item.count) {
                console.log('🔄 Polling: Correcting count mismatch', item.reward_id, existing.count, '→', item.count);
                newCounts.set(item.reward_id, {
                  ...existing,
                  count: item.count,
                  userNames: item.user_names || [],
                  displayName: item.display_name || item.title || existing.displayName,
                });
              }
            }
          });

          return newCounts;
        });
      } catch (error) {
        console.error('Failed to sync reward counts via polling:', error);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [groupId, isEnabled]);

  const countArray = useMemo(() => Array.from(counts.values()), [counts]);
  return { countArray };
}
