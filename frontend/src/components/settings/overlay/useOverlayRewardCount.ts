import { useEffect, useRef, useState } from 'react';

import { buildApiUrl } from '../../../utils/api';

interface RewardCountItem {
  reward_id: string;
  count: number;
  title?: string;
  display_name?: string;
  user_names?: string[];
}

interface UseOverlayRewardCountParams {
  overlaySettings: {
    reward_count_enabled?: boolean;
    reward_count_group_id?: number | null;
  } | null;
}

export const useOverlayRewardCount = ({
  overlaySettings,
}: UseOverlayRewardCountParams) => {
  const [rewardGroups, setRewardGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [rewardCounts, setRewardCounts] = useState<RewardCountItem[]>([]);
  const [groupRewardIds, setGroupRewardIds] = useState<Set<string>>(new Set());
  const groupRewardIdsRef = useRef<Set<string>>(new Set());
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchRewardGroups = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));
        if (response.ok) {
          const result = await response.json();
          setRewardGroups(result.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch reward groups:', error);
      }
    };

    fetchRewardGroups();
  }, []);

  const fetchGroupMembership = async (groupId: number) => {
    try {
      const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}`));
      if (response.ok) {
        const data = await response.json();
        const newRewardIds = new Set<string>(data.reward_ids || []);
        setGroupRewardIds(newRewardIds);
        groupRewardIdsRef.current = newRewardIds;
      }
    } catch (error) {
      console.error('Failed to fetch group membership:', error);
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
    }
  };

  const fetchRewardCounts = async () => {
    try {
      const groupId = overlaySettings?.reward_count_group_id;

      if (groupId) {
        await fetchGroupMembership(groupId);
      } else {
        setGroupRewardIds(new Set());
      }

      const endpoint = groupId
        ? `/api/twitch/reward-groups/${groupId}/counts`
        : '/api/twitch/reward-counts';
      const response = await fetch(buildApiUrl(endpoint));
      if (response.ok) {
        const counts = await response.json();
        setRewardCounts((counts || []).filter((c: any) => c.count > 0));
      }
    } catch (error) {
      console.error('Failed to fetch reward counts:', error);
    }
  };

  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
      return;
    }

    const groupId = overlaySettings?.reward_count_group_id;
    if (groupId) {
      fetchGroupMembership(groupId);
    } else {
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
    }
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      setRewardCounts([]);
      return;
    }

    fetchRewardCounts();
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      return;
    }

    let unsubUpdated: (() => void) | null = null;
    let unsubReset: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const { getWebSocketClient } = await import('../../../utils/websocket');
        const wsClient = getWebSocketClient();

        await wsClient.connect();

        unsubUpdated = wsClient.on('reward_count_updated', (data: any) => {
          const groupId = overlaySettings?.reward_count_group_id;
          if (groupId) {
            if (groupRewardIdsRef.current.size === 0) {
              return;
            }
            if (!groupRewardIdsRef.current.has(data.reward_id)) {
              return;
            }
          }

          setRewardCounts((prev) => {
            const filtered = prev.filter((c) => c.reward_id !== data.reward_id);
            if (data.count > 0) {
              return [...filtered, {
                reward_id: data.reward_id,
                count: data.count,
                title: data.title,
                display_name: data.display_name,
                user_names: data.user_names,
              }].sort((a, b) => b.count - a.count);
            }
            return filtered;
          });
        });

        unsubReset = wsClient.on('reward_counts_reset', () => {
          setRewardCounts([]);
        });
      } catch (error) {
        console.error('Failed to setup WebSocket for reward counts:', error);
      }
    };

    setupWebSocket();

    return () => {
      if (unsubUpdated) unsubUpdated();
      if (unsubReset) unsubReset();
    };
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  return {
    rewardGroups,
    rewardCounts,
    fetchRewardCounts,
    resetAllConfirm,
    setResetAllConfirm,
    deleteConfirmKey,
    setDeleteConfirmKey,
  };
};
