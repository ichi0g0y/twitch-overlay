import React, { useContext, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';

import { buildApiUrl } from '../../utils/api';
import { Button } from '../ui/button';
import { CollapsibleCard, WorkspaceCardUiContext } from '../ui/collapsible-card';
import { NewRewardGroupForm } from './reward-groups/NewRewardGroupForm';
import { RewardGroupItem } from './reward-groups/RewardGroupItem';
import type { RewardGroup } from './reward-groups/types';

export type { RewardGroup } from './reward-groups/types';

interface RewardGroupsManagerProps {
  onGroupsChanged?: () => void;
  availableRewardIds?: string[];
}

export const RewardGroupsManager: React.FC<RewardGroupsManagerProps> = ({
  onGroupsChanged,
  availableRewardIds = [],
}) => {
  const workspaceUi = useContext(WorkspaceCardUiContext);
  const [groups, setGroups] = useState<RewardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [togglingGroupId, setTogglingGroupId] = useState<number | null>(null);

  const getActiveRewardCount = (rewardIds: string[]) => {
    return rewardIds.filter((id) => availableRewardIds.includes(id)).length;
  };

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの取得に失敗しました');
      }

      const data = await response.json();
      setGroups(data.data || []);
    } catch (err) {
      console.error('Failed to fetch reward groups:', err);
      setError(err instanceof Error ? err.message : 'グループの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    setCreatingGroup(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/api/twitch/reward-groups'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newGroupName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの作成に失敗しました');
      }

      setNewGroupName('');
      setShowNewGroupInput(false);
      await fetchGroups();
      onGroupsChanged?.();
    } catch (err) {
      console.error('Failed to create reward group:', err);
      setError(err instanceof Error ? err.message : 'グループの作成に失敗しました');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroup = async (groupId: number) => {
    if (!editingGroupName.trim()) return;

    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editingGroupName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの更新に失敗しました');
      }

      setEditingGroupId(null);
      setEditingGroupName('');
      await fetchGroups();
      onGroupsChanged?.();
    } catch (err) {
      console.error('Failed to update reward group:', err);
      setError(err instanceof Error ? err.message : 'グループの更新に失敗しました');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('このグループを削除してもよろしいですか？')) return;

    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループの削除に失敗しました');
      }

      await fetchGroups();
      onGroupsChanged?.();
    } catch (err) {
      console.error('Failed to delete reward group:', err);
      setError(err instanceof Error ? err.message : 'グループの削除に失敗しました');
    }
  };

  const handleToggleGroup = async (groupId: number, enabled: boolean) => {
    setError(null);
    setTogglingGroupId(groupId);

    try {
      const response = await fetch(buildApiUrl(`/api/twitch/reward-groups/${groupId}/toggle`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'グループの切り替えに失敗しました');
      }

      await fetchGroups();
      onGroupsChanged?.();
    } catch (err) {
      console.error('Failed to toggle reward group:', err);
      setError(err instanceof Error ? err.message : 'グループの切り替えに失敗しました');
    } finally {
      setTogglingGroupId(null);
    }
  };

  const startEditing = (group: RewardGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const cancelEditing = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  if (loading) {
    return (
      <CollapsibleCard
        panelId="settings.twitch.reward-groups"
        title="リワードグループ管理"
        description="カスタムリワードをグループ化して一括でオン/オフできます"
      >
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500">読み込み中...</span>
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      panelId="settings.twitch.reward-groups"
      title="リワードグループ管理"
      description="カスタムリワードをグループ化して一括でオン/オフできます"
      actions={(
        <div className="flex items-center gap-1">
          <Button
            onClick={() => setShowNewGroupInput(!showNewGroupInput)}
            variant="outline"
            size="sm"
            className="nodrag h-7 w-7 p-0"
            aria-label="新規グループ作成"
            title="新規グループ作成"
            disabled={creatingGroup}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {workspaceUi?.onClose && (
            <button
              type="button"
              onClick={workspaceUi.onClose}
              aria-label="カードを削除"
              className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
          <AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {showNewGroupInput && (
        <NewRewardGroupForm
          newGroupName={newGroupName}
          creatingGroup={creatingGroup}
          onNewGroupNameChange={setNewGroupName}
          onCreateGroup={handleCreateGroup}
          onCancel={() => {
            setShowNewGroupInput(false);
            setNewGroupName('');
          }}
        />
      )}

      {groups.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          グループが見つかりません
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <RewardGroupItem
              key={group.id}
              group={group}
              activeRewardCount={getActiveRewardCount(group.reward_ids)}
              editingGroupId={editingGroupId}
              editingGroupName={editingGroupName}
              togglingGroupId={togglingGroupId}
              onEditingNameChange={setEditingGroupName}
              onUpdateGroup={handleUpdateGroup}
              onCancelEditing={cancelEditing}
              onStartEditing={startEditing}
              onToggleGroup={handleToggleGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
};
