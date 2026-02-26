import { Hash } from 'lucide-react';
import React from 'react';

import { buildApiUrl } from '../../../utils/api';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface RewardCountItem {
  reward_id: string;
  count: number;
  title?: string;
  display_name?: string;
  user_names?: string[];
}

interface RewardCountCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  overlaySettings: any;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
  rewardGroups: Array<{ id: number; name: string }>;
  rewardCounts: RewardCountItem[];
  fetchRewardCounts: () => Promise<void>;
  resetAllConfirm: boolean;
  setResetAllConfirm: (value: boolean) => void;
  deleteConfirmKey: string | null;
  setDeleteConfirmKey: (value: string | null) => void;
}

export const RewardCountCard: React.FC<RewardCountCardProps> = ({
  column,
  focusCard,
  draggingCard,
  onDragStart,
  onDragEnd,
  preview,
  overlaySettings,
  updateOverlaySettings,
  rewardGroups,
  rewardCounts,
  fetchRewardCounts,
  resetAllConfirm,
  setResetAllConfirm,
  deleteConfirmKey,
  setDeleteConfirmKey,
}) => {
  return (
    <OverlayCardFrame
      panelId="settings.overlay.reward-count"
      cardKey="rewardCount"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Hash className="w-4 h-4" />
          リワードカウント表示
        </span>
      )}
      description="使用されたリワードの回数を蓄積表示します"
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="reward-count-enabled" className="flex flex-col">
          <span>カウント表示を有効化</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            オーバーレイにリワード使用回数を表示します
          </span>
        </Label>
        <Switch
          id="reward-count-enabled"
          checked={overlaySettings?.reward_count_enabled ?? false}
          onCheckedChange={(checked) =>
            updateOverlaySettings({ reward_count_enabled: checked })
          }
        />
      </div>

      {(overlaySettings?.reward_count_enabled ?? false) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="reward-count-position" className="flex flex-col">
              <span>右側に表示</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                オフの場合は左側に表示されます
              </span>
            </Label>
            <Switch
              id="reward-count-position"
              checked={(overlaySettings?.reward_count_position || 'left') === 'right'}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ reward_count_position: checked ? 'right' : 'left' })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward-count-group">表示対象グループ</Label>
            <Select
              value={overlaySettings?.reward_count_group_id?.toString() || 'all'}
              onValueChange={(value) =>
                updateOverlaySettings({ reward_count_group_id: value === 'all' ? null : parseInt(value, 10) })
              }
            >
              <SelectTrigger id="reward-count-group">
                <SelectValue placeholder="すべてのリワード" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのリワード</SelectItem>
                {rewardGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id.toString()}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              特定のグループのリワードのみカウント表示します
            </p>
          </div>

          {rewardCounts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>現在表示中のリワード</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await fetchRewardCounts();
                        const url = buildApiUrl('/api/overlay/refresh');
                        await fetch(url, { method: 'POST' });
                      } catch (error) {
                        console.error('Failed to refresh:', error);
                      }
                    }}
                  >
                    🔄
                  </Button>
                  <Button
                    variant={resetAllConfirm ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={async () => {
                      if (!resetAllConfirm) {
                        setResetAllConfirm(true);
                        return;
                      }

                      try {
                        const response = await fetch(buildApiUrl('/api/twitch/reward-counts/reset'), { method: 'POST' });
                        if (!response.ok) {
                          const errorText = await response.text();
                          throw new Error(`HTTP ${response.status}: ${errorText}`);
                        }

                        await fetchRewardCounts();
                        setResetAllConfirm(false);
                        alert('カウントをリセットしました');
                      } catch (error) {
                        console.error('Failed to reset counts:', error);
                        setResetAllConfirm(false);
                        alert(`リセットに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                  >
                    {resetAllConfirm ? '本当に全リセット？' : 'すべてのカウントをリセット'}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {rewardCounts.map((reward) => (
                  <Card key={reward.reward_id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-left">
                        {reward.display_name || reward.title || reward.reward_id}
                      </CardTitle>
                      <CardDescription className="text-left">カウント: {reward.count}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 text-left">
                      {reward.user_names && reward.user_names.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {reward.user_names.map((userName, index) => {
                            const deleteKey = `${reward.reward_id}-${index}`;
                            const isConfirming = deleteConfirmKey === deleteKey;

                            return (
                              <div
                                key={index}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                  isConfirming
                                    ? 'bg-red-100 dark:bg-red-900/30'
                                    : 'bg-gray-100 dark:bg-gray-800'
                                }`}
                              >
                                <span className="text-gray-700 dark:text-gray-300">{userName}</span>
                                <button
                                  type="button"
                                  className={`ml-1 ${
                                    isConfirming
                                      ? 'text-red-600 dark:text-red-400 font-bold'
                                      : 'text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400'
                                  }`}
                                  onClick={async () => {
                                    if (!isConfirming) {
                                      setDeleteConfirmKey(deleteKey);
                                      return;
                                    }

                                    try {
                                      const response = await fetch(
                                        buildApiUrl(`/api/twitch/reward-counts/${reward.reward_id}/users/${index}`),
                                        { method: 'DELETE' },
                                      );

                                      if (!response.ok) {
                                        const errorText = await response.text();
                                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                                      }

                                      await fetchRewardCounts();
                                      setDeleteConfirmKey(null);
                                    } catch (error) {
                                      console.error('Failed to remove user:', error);
                                      alert(`ユーザー削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                                      setDeleteConfirmKey(null);
                                    }
                                  }}
                                  aria-label={`${userName}を削除`}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </OverlayCardFrame>
  );
};
