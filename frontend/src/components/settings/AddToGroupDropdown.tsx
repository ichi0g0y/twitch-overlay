import React, { useState, useEffect, useRef } from 'react';
import { Plus, Loader2, Check } from 'lucide-react';
import { buildApiUrl } from '../../utils/api';
import type { RewardGroup } from './RewardGroupsManager';

interface AddToGroupDropdownProps {
  rewardId: string;
  currentGroups: RewardGroup[];
  onAdded: () => void;
}

export const AddToGroupDropdown: React.FC<AddToGroupDropdownProps> = ({
  rewardId,
  currentGroups,
  onAdded,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<RewardGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAvailableGroups();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchAvailableGroups = async () => {
    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));

      if (!response.ok) {
        throw new Error('グループの取得に失敗しました');
      }

      const data = await response.json();
      const allGroups = data.data || [];

      // Filter out groups that the reward is already a member of
      const currentGroupIds = currentGroups.map(g => g.id);
      const available = allGroups.filter((g: RewardGroup) => !currentGroupIds.includes(g.id));

      setAvailableGroups(available);
    } catch (err) {
      console.error('Failed to fetch available groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToGroup = async (groupId: number) => {
    if (adding) return;

    setAdding(true);

    try {
      const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}/rewards`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reward_id: rewardId }),
      });

      if (!response.ok) {
        throw new Error('グループへの追加に失敗しました');
      }

      onAdded();
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to add reward to group:', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center space-x-1 h-6 px-2 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <Plus className="w-3 h-3" />
        <span>グループに追加</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="p-2 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                <span className="ml-2 text-xs text-gray-500">読み込み中...</span>
              </div>
            ) : availableGroups.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-500">
                追加可能なグループがありません
              </div>
            ) : (
              <div className="space-y-1">
                {availableGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToGroup(group.id);
                    }}
                    disabled={adding}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium dark:text-white truncate">{group.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {group.reward_ids.length}個のリワード
                      </div>
                    </div>
                    {adding && (
                      <Loader2 className="w-3 h-3 animate-spin ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
