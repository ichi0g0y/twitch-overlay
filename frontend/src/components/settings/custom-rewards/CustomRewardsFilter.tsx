import React from 'react';

import type { RewardGroup } from '../RewardGroupsManager';

interface CustomRewardsFilterProps {
  allGroups: RewardGroup[];
  selectedGroupId: number | null;
  showUngroupedOnly: boolean;
  onSelectAll: () => void;
  onSelectGroup: (groupId: number) => void;
  onSelectUngrouped: () => void;
}

export const CustomRewardsFilter: React.FC<CustomRewardsFilterProps> = ({
  allGroups,
  selectedGroupId,
  showUngroupedOnly,
  onSelectAll,
  onSelectGroup,
  onSelectUngrouped,
}) => {
  if (allGroups.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 pb-4 border-b dark:border-gray-700">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        グループでフィルター
      </div>
      <div className="flex items-center flex-wrap gap-2">
        <button
          onClick={onSelectAll}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedGroupId === null && !showUngroupedOnly
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          すべて
        </button>
        {allGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => onSelectGroup(group.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedGroupId === group.id && !showUngroupedOnly
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {group.name}
          </button>
        ))}
        <button
          onClick={onSelectUngrouped}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            showUngroupedOnly
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          グループなし
        </button>
      </div>
    </div>
  );
};
