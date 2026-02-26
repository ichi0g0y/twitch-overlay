import React, { useEffect, useState } from 'react';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';

import { buildApiUrl } from '../../utils/api';
import { Button } from '../ui/button';
import { CollapsibleCard } from '../ui/collapsible-card';
import { CreateRewardDialog } from './CreateRewardDialog';
import type { RewardGroup } from './RewardGroupsManager';
import { fetchAllRewardGroups, fetchRewardGroupsMap } from './custom-rewards/api';
import { CustomRewardCard } from './custom-rewards/CustomRewardCard';
import { CustomRewardsFilter } from './custom-rewards/CustomRewardsFilter';
import type { CustomReward, CustomRewardsResponse } from './custom-rewards/types';

interface CustomRewardsListProps {
  refreshTrigger?: number;
}

export const CustomRewardsList: React.FC<CustomRewardsListProps> = ({
  refreshTrigger = 0,
}) => {
  const [rewards, setRewards] = useState<CustomReward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rewardGroups, setRewardGroups] = useState<Map<string, RewardGroup[]>>(new Map());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteClickedId, setDeleteClickedId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
  const [editingDisplayNameValue, setEditingDisplayNameValue] = useState<string>('');
  const [allGroups, setAllGroups] = useState<RewardGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showUngroupedOnly, setShowUngroupedOnly] = useState(false);

  const fetchRewardGroups = async (rewardsList: CustomReward[]) => {
    const groupsMap = await fetchRewardGroupsMap(rewardsList);
    setRewardGroups(groupsMap);
  };

  const fetchRewards = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/api/twitch/custom-rewards'));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'カスタムリワードの取得に失敗しました');
      }

      const data: CustomRewardsResponse = await response.json();
      const rewardsData = data.data || [];
      setRewards(rewardsData);
      await fetchRewardGroups(rewardsData);
    } catch (err) {
      console.error('Failed to fetch custom rewards:', err);
      setError(err instanceof Error ? err.message : 'カスタムリワードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllGroups = async () => {
    const groups = await fetchAllRewardGroups();
    setAllGroups(groups);
  };

  const handleRemoveFromGroup = async (rewardId: string, groupId: number) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/twitch/reward-groups/${groupId}/rewards/${rewardId}`),
        { method: 'DELETE' },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループからの削除に失敗しました');
      }

      await fetchRewardGroups(rewards);
    } catch (err) {
      console.error('Failed to remove reward from group:', err);
      setError(err instanceof Error ? err.message : 'グループからの削除に失敗しました');
    }
  };

  const handleToggleReward = async (rewardId: string, currentEnabled: boolean) => {
    try {
      const response = await fetch(buildApiUrl(`/api/twitch/custom-rewards/${rewardId}/toggle`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentEnabled }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setRewards((prev) =>
        prev.map((r) => (r.id === rewardId ? { ...r, is_enabled: !currentEnabled } : r)),
      );
    } catch (err) {
      console.error('Failed to toggle reward:', err);
      alert(err instanceof Error ? err.message : 'リワードの切り替えに失敗しました');
    }
  };

  const handleDeleteReward = async (rewardId: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/twitch/custom-rewards/${rewardId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'リワードの削除に失敗しました');
      }

      setRewards((prevRewards) => prevRewards.filter((r) => r.id !== rewardId));
      setDeleteClickedId(null);
    } catch (err) {
      console.error('Failed to delete reward:', err);
      alert(err instanceof Error ? err.message : 'リワードの削除に失敗しました');
    }
  };

  const handleDeleteClick = (rewardId: string) => {
    if (deleteClickedId === rewardId) {
      handleDeleteReward(rewardId);
      return;
    }

    setDeleteClickedId(rewardId);
    setTimeout(() => {
      setDeleteClickedId(null);
    }, 3000);
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy ID:', err);
    }
  };

  const handleSaveDisplayName = async (rewardId: string, displayName: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/twitch/rewards/${rewardId}/display-name`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: displayName }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to save display name');
      }

      setRewards((prev) =>
        prev.map((r) => (r.id === rewardId ? { ...r, saved_display_name: displayName } : r)),
      );

      setEditingDisplayName(null);
      setEditingDisplayNameValue('');
    } catch (err) {
      console.error('Failed to save display name:', err);
      alert('カスタム名称の保存に失敗しました');
    }
  };

  useEffect(() => {
    fetchRewards();
    fetchAllGroups();
  }, [refreshTrigger]);

  const filteredRewards = showUngroupedOnly
    ? rewards.filter((reward) => (rewardGroups.get(reward.id) || []).length === 0)
    : selectedGroupId === null
      ? rewards
      : rewards.filter((reward) => {
          const groups = rewardGroups.get(reward.id) || [];
          return groups.some((g) => g.id === selectedGroupId);
        });

  if (loading) {
    return <CollapsibleCard panelId="settings.twitch.custom-rewards" title="カスタムリワード一覧" description="チャンネルポイントで引き換え可能なカスタムリワード"><div className="flex items-center justify-center py-8">読み込み中...</div></CollapsibleCard>;
  }

  if (error && rewards.length === 0) {
    return (
        <CollapsibleCard
          panelId="settings.twitch.custom-rewards"
          title="カスタムリワード一覧"
          description="チャンネルポイントで引き換え可能なカスタムリワード"
        >
        <div className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={fetchRewards} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            再読み込み
          </Button>
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <>
      <CreateRewardDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={fetchRewards}
      />

      <CollapsibleCard
        panelId="settings.twitch.custom-rewards"
        title="カスタムリワード一覧"
        description="チャンネルポイントで引き換え可能なカスタムリワード"
        actions={(
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              variant="default"
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              新規作成
            </Button>
            <Button onClick={fetchRewards} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              更新
            </Button>
          </div>
        )}
      >
        <CustomRewardsFilter
          allGroups={allGroups}
          selectedGroupId={selectedGroupId}
          showUngroupedOnly={showUngroupedOnly}
          onSelectAll={() => { setSelectedGroupId(null); setShowUngroupedOnly(false); }}
          onSelectGroup={(groupId) => { setSelectedGroupId(groupId); setShowUngroupedOnly(false); }}
          onSelectUngrouped={() => { setSelectedGroupId(null); setShowUngroupedOnly(true); }}
        />

        {filteredRewards.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {showUngroupedOnly
              ? 'グループに属していないリワードが見つかりません'
              : selectedGroupId === null
                ? 'カスタムリワードが見つかりません'
                : 'このグループに属するリワードが見つかりません'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRewards.map((reward) => (
              <CustomRewardCard
                key={reward.id}
                reward={reward}
                groups={rewardGroups.get(reward.id) || []}
                copiedId={copiedId}
                deleteClickedId={deleteClickedId}
                editingDisplayName={editingDisplayName}
                editingDisplayNameValue={editingDisplayNameValue}
                onToggleReward={handleToggleReward}
                onDeleteClick={handleDeleteClick}
                onRemoveFromGroup={handleRemoveFromGroup}
                onAddedToGroup={() => fetchRewardGroups(rewards)}
                onCopyId={handleCopyId}
                onStartEditDisplayName={(targetReward) => {
                  setEditingDisplayName(targetReward.id);
                  setEditingDisplayNameValue(targetReward.saved_display_name || '');
                }}
                onDisplayNameValueChange={setEditingDisplayNameValue}
                onSaveDisplayName={handleSaveDisplayName}
                onCancelEditDisplayName={() => { setEditingDisplayName(null); setEditingDisplayNameValue(''); }}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>
    </>
  );
};
