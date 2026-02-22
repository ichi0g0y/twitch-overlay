import React, { useEffect, useState } from 'react';
import { Award, Loader2, RefreshCw, AlertCircle, Copy, Check, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { CollapsibleCard } from '../ui/collapsible-card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { buildApiUrl } from '../../utils/api';
import { RewardGroupBadge } from './RewardGroupBadge';
import { AddToGroupDropdown } from './AddToGroupDropdown';
import { CreateRewardDialog } from './CreateRewardDialog';
import type { RewardGroup } from './RewardGroupsManager';

interface CustomReward {
  id: string;
  title: string;
  prompt: string;
  cost: number;
  is_enabled: boolean;
  background_color: string;
  is_user_input_required: boolean;
  is_paused: boolean;
  is_in_stock: boolean;
  is_manageable?: boolean;
  saved_display_name?: string;
  saved_is_enabled?: boolean;
  redemptions_redeemed_current_stream?: number;
  max_per_stream_setting?: {
    is_enabled: boolean;
    max_per_stream: number;
  };
  max_per_user_per_stream_setting?: {
    is_enabled: boolean;
    max_per_user_per_stream: number;
  };
  global_cooldown_setting?: {
    is_enabled: boolean;
    global_cooldown_seconds: number;
  };
}

interface CustomRewardsResponse {
  data: CustomReward[];
  error?: string;
}

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
      setRewards(data.data || []);

      // Fetch groups for each reward
      await fetchRewardGroups(data.data || []);
    } catch (err) {
      console.error('Failed to fetch custom rewards:', err);
      setError(err instanceof Error ? err.message : 'カスタムリワードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllGroups = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));

      if (response.ok) {
        const data = await response.json();
        setAllGroups(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch all groups:', err);
    }
  };

  const fetchRewardGroups = async (rewardsList: CustomReward[]) => {
    const groupsMap = new Map<string, RewardGroup[]>();

    for (const reward of rewardsList) {
      try {
        const response = await fetch(
          buildApiUrl(`/api/twitch/reward-groups/by-reward?reward_id=${encodeURIComponent(reward.id)}`)
        );

        if (response.ok) {
          const data = await response.json();
          groupsMap.set(reward.id, data.data || []);
        }
      } catch (err) {
        console.error(`Failed to fetch groups for reward ${reward.id}:`, err);
      }
    }

    setRewardGroups(groupsMap);
  };

  const handleRemoveFromGroup = async (rewardId: string, groupId: number) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/twitch/reward-groups/${groupId}/rewards/${rewardId}`),
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'グループからの削除に失敗しました');
      }

      // Refresh groups for this reward
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

      // Update local state
      setRewards((prev) =>
        prev.map((r) =>
          r.id === rewardId ? { ...r, is_enabled: !currentEnabled } : r
        )
      );
    } catch (err) {
      console.error('Failed to toggle reward:', err);
      // Show error as an alert instead of replacing the entire list
      alert(err instanceof Error ? err.message : 'リワードの切り替えに失敗しました');
    }
  };

  const handleDeleteClick = (rewardId: string) => {
    if (deleteClickedId === rewardId) {
      // 2回目のクリック - 削除実行
      handleDeleteReward(rewardId);
    } else {
      // 1回目のクリック - 状態を保存
      setDeleteClickedId(rewardId);
      // 3秒後に状態をリセット
      setTimeout(() => {
        setDeleteClickedId(null);
      }, 3000);
    }
  };

  const handleDeleteReward = async (rewardId: string) => {
    console.log('handleDeleteReward called', { rewardId });

    try {
      const url = buildApiUrl(`/api/twitch/custom-rewards/${rewardId}`);

      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'リワードの削除に失敗しました');
      }

      console.log('Delete successful, updating local state...');

      // ページをスクロールさせずにローカル状態を更新
      setRewards((prevRewards) => prevRewards.filter((r) => r.id !== rewardId));
      setDeleteClickedId(null);
    } catch (err) {
      console.error('Failed to delete reward:', err);
      alert(err instanceof Error ? err.message : 'リワードの削除に失敗しました');
    }
  };

  useEffect(() => {
    fetchRewards();
    fetchAllGroups();
  }, [refreshTrigger]);

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
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save display name');
      }

      // Update local state
      setRewards((prev) =>
        prev.map((r) =>
          r.id === rewardId ? { ...r, saved_display_name: displayName } : r
        )
      );

      // Close editing mode
      setEditingDisplayName(null);
      setEditingDisplayNameValue('');
    } catch (err) {
      console.error('Failed to save display name:', err);
      alert('カスタム名称の保存に失敗しました');
    }
  };

  // フィルタリングされたリワードを取得
  const filteredRewards = showUngroupedOnly
    ? rewards.filter(reward => {
        const groups = rewardGroups.get(reward.id) || [];
        return groups.length === 0;
      })
    : selectedGroupId === null
    ? rewards
    : rewards.filter(reward => {
        const groups = rewardGroups.get(reward.id) || [];
        return groups.some(g => g.id === selectedGroupId);
      });

  if (loading) {
    return (
      <CollapsibleCard
        panelId="settings.twitch.custom-rewards"
        title={(
          <span className="flex items-center space-x-2">
            <Award className="w-5 h-5" />
            <span>カスタムリワード一覧</span>
          </span>
        )}
        description="チャンネルポイントで引き換え可能なカスタムリワード"
      >
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-500">読み込み中...</span>
          </div>
      </CollapsibleCard>
    );
  }

  if (error && rewards.length === 0) {
    return (
      <CollapsibleCard
        panelId="settings.twitch.custom-rewards"
        title={(
          <span className="flex items-center space-x-2">
            <Award className="w-5 h-5" />
            <span>カスタムリワード一覧</span>
          </span>
        )}
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
        onCreated={() => {
          fetchRewards();
        }}
      />

      <CollapsibleCard
        panelId="settings.twitch.custom-rewards"
        title={(
          <span className="flex items-center space-x-2">
            <Award className="w-5 h-5" />
            <span>カスタムリワード一覧</span>
          </span>
        )}
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
        {/* グループフィルター */}
        {allGroups.length > 0 && (
          <div className="mb-4 pb-4 border-b dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              グループでフィルター
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedGroupId(null);
                  setShowUngroupedOnly(false);
                }}
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
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setShowUngroupedOnly(false);
                  }}
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
                onClick={() => {
                  setSelectedGroupId(null);
                  setShowUngroupedOnly(true);
                }}
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
        )}

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
            {filteredRewards.map((reward) => {
              return (
                <div
                  key={reward.id}
                  className="border dark:border-gray-700 rounded-lg p-4 transition-colors relative"
                >
                  {/* ON/OFFスイッチ（右上） */}
                  <div className="absolute top-4 right-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {reward.is_enabled ? 'ON' : 'OFF'}
                      </span>
                      <div className="relative inline-block w-10 h-5">
                        <input
                          type="checkbox"
                          checked={reward.is_enabled}
                          onChange={() => handleToggleReward(reward.id, reward.is_enabled)}
                          className="sr-only peer"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors ${
                          reward.is_enabled
                            ? 'bg-blue-600'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}></div>
                        <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          reward.is_enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}></div>
                      </div>
                    </label>
                  </div>

                  <div className="flex items-start space-x-3 pr-24">
                    {/* リワード情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <div
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ backgroundColor: reward.background_color }}
                        />
                        <h3 className="font-semibold dark:text-white">
                          {reward.title}
                          {reward.saved_display_name && (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              → {reward.saved_display_name}
                            </span>
                          )}
                        </h3>
                        {reward.is_manageable && (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                              このアプリで作成
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(reward.id);
                              }}
                              className={`p-1 rounded transition-colors ${
                                deleteClickedId === reward.id
                                  ? 'bg-red-500 text-white hover:bg-red-600'
                                  : 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                              }`}
                              title={
                                deleteClickedId === reward.id
                                  ? 'もう一度クリックで削除'
                                  : 'クリックして削除（2回クリック必要）'
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {!reward.is_enabled && (
                          <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
                            無効
                          </span>
                        )}
                        {reward.is_paused && (
                          <span className="text-xs px-2 py-1 bg-yellow-200 dark:bg-yellow-900 rounded">
                            一時停止
                          </span>
                        )}
                      </div>
                      {reward.prompt && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {reward.prompt}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <span className="font-medium">{reward.cost.toLocaleString()} pts</span>
                        {reward.is_user_input_required && (
                          <span>テキスト入力必須</span>
                        )}
                        {reward.redemptions_redeemed_current_stream !== undefined && (
                          <span>今日の引き換え: {reward.redemptions_redeemed_current_stream}</span>
                        )}
                      </div>

                      {/* グループバッジ */}
                      <div className="flex items-center flex-wrap gap-2">
                        {(rewardGroups.get(reward.id) || []).map((group) => (
                          <RewardGroupBadge
                            key={group.id}
                            groupName={group.name}
                            onRemove={() => handleRemoveFromGroup(reward.id, group.id)}
                          />
                        ))}
                        <AddToGroupDropdown
                          rewardId={reward.id}
                          currentGroups={rewardGroups.get(reward.id) || []}
                          onAdded={() => fetchRewardGroups(rewards)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 詳細情報セクション */}
                  <div className="mt-3 pt-3 border-t dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                        <span>ID:</span>
                        <span className="select-all">{reward.id}</span>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyId(reward.id);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                      >
                        {copiedId === reward.id ? (
                          <>
                            <Check className="w-3 h-3 mr-1 text-green-500" />
                            <span className="text-xs text-green-500">コピーしました</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            <span className="text-xs">コピー</span>
                          </>
                        )}
                      </Button>
                    </div>
                    {/* カスタム表示名 */}
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        カスタム表示名 (リワードカウント表示用)
                      </div>
                      {editingDisplayName === reward.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editingDisplayNameValue}
                            onChange={(e) => setEditingDisplayNameValue(e.target.value)}
                            placeholder={reward.title}
                            className="flex-1 h-8 text-sm"
                            autoFocus
                          />
                          <Button
                            onClick={() => handleSaveDisplayName(reward.id, editingDisplayNameValue)}
                            variant="default"
                            size="sm"
                            className="h-8 px-2"
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            onClick={() => {
                              setEditingDisplayName(null);
                              setEditingDisplayNameValue('');
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 text-sm text-gray-600 dark:text-gray-400 py-1">
                            {reward.saved_display_name || <span className="italic">未設定（実際の名前を使用）</span>}
                          </div>
                          <Button
                            onClick={() => {
                              setEditingDisplayName(reward.id);
                              setEditingDisplayNameValue(reward.saved_display_name || '');
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            <span className="text-xs">編集</span>
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* 詳細情報 */}
                    <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {reward.max_per_stream_setting?.is_enabled && (
                        <div>
                          配信ごとの上限: {reward.max_per_stream_setting.max_per_stream}
                        </div>
                      )}
                      {reward.max_per_user_per_stream_setting?.is_enabled && (
                        <div>
                          ユーザーごとの上限: {reward.max_per_user_per_stream_setting.max_per_user_per_stream}
                        </div>
                      )}
                      {reward.global_cooldown_setting?.is_enabled && (
                        <div>
                          クールダウン: {reward.global_cooldown_setting.global_cooldown_seconds}秒
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleCard>
    </>
  );
};
