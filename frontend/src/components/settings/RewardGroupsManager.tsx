import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { GetServerPort } from '../../../bindings/github.com/ichi0g0y/twitch-overlay/app.js';

export interface RewardGroup {
  id: number;
  name: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  reward_ids: string[];
}

interface RewardGroupsManagerProps {
  onGroupsChanged?: () => void;
  availableRewardIds?: string[]; // 実際に取得されたリワードIDリスト
}

export const RewardGroupsManager: React.FC<RewardGroupsManagerProps> = ({
  onGroupsChanged,
  availableRewardIds = []
}) => {
  const [groups, setGroups] = useState<RewardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [togglingGroupId, setTogglingGroupId] = useState<number | null>(null);

  // グループ内の実際に存在するリワード数を計算
  const getActiveRewardCount = (rewardIds: string[]) => {
    return rewardIds.filter(id => availableRewardIds.includes(id)).length;
  };

  const fetchGroups = async () => {
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
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups`, {
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
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups/${groupId}`, {
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
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups/${groupId}`, {
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
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/reward-groups/${groupId}/toggle`, {
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
      <Card>
        <CardHeader>
          <CardTitle>リワードグループ管理</CardTitle>
          <CardDescription>
            カスタムリワードをグループ化して一括でオン/オフできます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-500">読み込み中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>リワードグループ管理</CardTitle>
            <CardDescription>
              カスタムリワードをグループ化して一括でオン/オフできます
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowNewGroupInput(!showNewGroupInput)}
            variant="default"
            size="sm"
            disabled={creatingGroup}
          >
            <Plus className="w-4 h-4 mr-1" />
            新規グループ作成
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
            <AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {showNewGroupInput && (
          <div className="mb-4 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <Label htmlFor="new-group-name">グループ名</Label>
            <div className="flex items-center space-x-2 mt-2">
              <Input
                id="new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateGroup();
                  if (e.key === 'Escape') {
                    setShowNewGroupInput(false);
                    setNewGroupName('');
                  }
                }}
                placeholder="グループ名を入力"
                disabled={creatingGroup}
                autoFocus
              />
              <Button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || creatingGroup}
                size="sm"
              >
                {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : '作成'}
              </Button>
              <Button
                onClick={() => {
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                }}
                variant="outline"
                size="sm"
                disabled={creatingGroup}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            グループが見つかりません
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="border dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {editingGroupId === group.id ? (
                      <div className="flex items-center space-x-2">
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateGroup(group.id);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          className="max-w-xs"
                          autoFocus
                        />
                        <Button
                          onClick={() => handleUpdateGroup(group.id)}
                          size="sm"
                          disabled={!editingGroupName.trim()}
                        >
                          保存
                        </Button>
                        <Button
                          onClick={cancelEditing}
                          variant="outline"
                          size="sm"
                        >
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <h3 className="font-semibold dark:text-white">
                          {group.name}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {getActiveRewardCount(group.reward_ids)}個のリワード
                        </span>
                      </div>
                    )}
                  </div>

                  {editingGroupId !== group.id && (
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-2">
                        {togglingGroupId === group.id ? (
                          <div className="flex items-center space-x-2">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                            <span className="text-sm text-gray-500">適用中...</span>
                          </div>
                        ) : (
                          <>
                            <Label htmlFor={`group-${group.id}-toggle`} className="text-sm">
                              {group.is_enabled ? 'ON' : 'OFF'}
                            </Label>
                            <Switch
                              id={`group-${group.id}-toggle`}
                              checked={group.is_enabled}
                              onCheckedChange={(checked) => handleToggleGroup(group.id, checked)}
                              disabled={togglingGroupId !== null}
                            />
                          </>
                        )}
                      </div>
                      <Button
                        onClick={() => startEditing(group)}
                        variant="ghost"
                        size="sm"
                        disabled={togglingGroupId !== null}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteGroup(group.id)}
                        variant="ghost"
                        size="sm"
                        disabled={togglingGroupId !== null}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
