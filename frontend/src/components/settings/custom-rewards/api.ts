import { buildApiUrl } from '../../../utils/api';
import type { RewardGroup } from '../RewardGroupsManager';
import type { CustomReward } from './types';

export const fetchRewardGroupsMap = async (rewardsList: CustomReward[]) => {
  const groupsMap = new Map<string, RewardGroup[]>();

  for (const reward of rewardsList) {
    try {
      const response = await fetch(
        buildApiUrl(`/api/twitch/reward-groups/by-reward?reward_id=${encodeURIComponent(reward.id)}`),
      );
      if (response.ok) {
        const data = await response.json();
        groupsMap.set(reward.id, data.data || []);
      }
    } catch (err) {
      console.error(`Failed to fetch groups for reward ${reward.id}:`, err);
    }
  }

  return groupsMap;
};

export const fetchAllRewardGroups = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));
    if (!response.ok) {
      return [] as RewardGroup[];
    }

    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error('Failed to fetch all reward groups:', err);
    return [] as RewardGroup[];
  }
};
