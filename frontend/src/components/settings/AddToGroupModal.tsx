import React, { useState, useEffect } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { GetServerPort } from '../../../bindings/github.com/ichi0g0y/twitch-overlay/app.js';
import type { RewardGroup } from './RewardGroupsManager';

interface AddToGroupModalProps {
  rewardId: string;
  rewardTitle: string;
  currentGroups: RewardGroup[];
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export const AddToGroupModal: React.FC<AddToGroupModalProps> = ({
  rewardId,
  rewardTitle,
  currentGroups,
  isOpen,
  onClose,
  onAdded,
}) => {
  const [availableGroups, setAvailableGroups] = useState<RewardGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAvailableGroups();
    }
  }, [isOpen]);

  const fetchAvailableGroups = async () => {
    setLoading(true);
    setError(null);

    try {
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの取得に失敗しました');
      }

      const data = await response.json();
      const allGroups = data.data || [];

      // Filter out groups that the reward is already a member of
      const currentGroupIds = currentGroups.map(g => g.id);
      const available = allGroups.filter((g: RewardGroup) => !currentGroupIds.includes(g.id));

      setAvailableGroups(available);
    } catch (err) {
      console.error('Failed to fetch available groups:', err);
      setError(err instanceof Error ? err.message : 'グループの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToGroup = async () => {
    if (!selectedGroupId) return;

    setAdding(true);
    setError(null);

    try {
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups/${selectedGroupId}/rewards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reward_id: rewardId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループへの追加に失敗しました');
      }

      onAdded();
      onClose();
      setSelectedGroupId(null);
    } catch (err) {
      console.error('Failed to add reward to group:', err);
      setError(err instanceof Error ? err.message : 'グループへの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    if (!adding) {
      onClose();
      setSelectedGroupId(null);
      setError(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 dark:text-white">グループに追加</h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          「{rewardTitle}」を追加するグループを選択してください
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
            <AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-500">読み込み中...</span>
          </div>
        ) : availableGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            追加可能なグループがありません
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {availableGroups.map((group) => (
              <label
                key={group.id}
                className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedGroupId === group.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="group"
                  value={group.id}
                  checked={selectedGroupId === group.id}
                  onChange={() => setSelectedGroupId(group.id)}
                  className="w-4 h-4 text-blue-600"
                  disabled={adding}
                />
                <div className="flex-1">
                  <div className="font-medium dark:text-white">{group.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {group.reward_ids.length}個のリワード
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end space-x-2">
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={adding}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleAddToGroup}
            disabled={!selectedGroupId || adding || loading}
          >
            {adding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                追加中...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                追加
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
