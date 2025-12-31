import React, { useState } from 'react';
import { toast } from 'sonner';
import { useRemote } from '../../contexts/RemoteContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { buildApiUrl } from '../../utils/api';

interface RewardCountSettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const RewardCountSettings: React.FC<RewardCountSettingsProps> = ({ isExpanded, onToggle }) => {
  const { overlaySettings, updateOverlaySettings, rewardGroups, rewardCounts, fetchRewardCounts } = useRemote();
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  return (
    <Card className="break-inside-avoid mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle>リワードカウント表示</CardTitle>
            <CardDescription>
              使用されたリワードの回数を蓄積表示します
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
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
                    updateOverlaySettings({
                      reward_count_position: checked ? 'right' : 'left'
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reward-count-group">表示対象グループ</Label>
                <Select
                  value={overlaySettings?.reward_count_group_id?.toString() || 'all'}
                  onValueChange={(value) =>
                    updateOverlaySettings({
                      reward_count_group_id: value === 'all' ? null : parseInt(value)
                    })
                  }
                >
                  <SelectTrigger id="reward-count-group">
                    <SelectValue placeholder="すべてのリワード" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべてのリワード</SelectItem>
                    {rewardGroups.map(group => (
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

              {/* 現在のカウント一覧 */}
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
                            // 設定画面のカウントデータを再取得
                            await fetchRewardCounts();
                            // オーバーレイに設定を再送信（強制リフレッシュ）
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
                        variant={resetAllConfirm ? "destructive" : "outline"}
                        size="sm"
                        onClick={async () => {
                          console.log('🔘 Reset all button clicked:', { resetAllConfirm });

                          // 1回目のクリック: 確認状態にする
                          if (!resetAllConfirm) {
                            console.log('🔄 Setting reset all confirm state');
                            setResetAllConfirm(true);
                            return;
                          }

                          // 2回目のクリック: 実際にリセット
                          console.log('🔥 Executing reset all');
                          try {
                            const url = buildApiUrl('/api/twitch/reward-counts/reset');
                            console.log('🔄 Resetting all reward counts:', url);
                            const response = await fetch(url, { method: 'POST' });
                            console.log('✅ Reset all response:', response.status, response.statusText);

                            if (!response.ok) {
                              const errorText = await response.text();
                              throw new Error(`HTTP ${response.status}: ${errorText}`);
                            }

                            // 即座に再取得
                            await fetchRewardCounts();
                            setResetAllConfirm(false);
                            toast.success('カウントをリセットしました');
                          } catch (error) {
                            console.error('❌ Failed to reset counts:', error);
                            setResetAllConfirm(false);
                            toast.error(`リセットに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                          }
                        }}
                      >
                        {resetAllConfirm ? '本当に全リセット？' : 'すべてのカウントをリセット'}
                      </Button>
                    </div>
                  </div>

                  {/* 各リワードをCardで表示 */}
                  <div className="space-y-3">
                    {rewardCounts.map((reward) => (
                      <Card key={reward.reward_id}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base text-left">
                            {reward.display_name || reward.title || reward.reward_id}
                          </CardTitle>
                          <CardDescription className="text-left">
                            カウント: {reward.count}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          {/* ユーザー名リスト */}
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
                                          // 1回目のクリック: 確認状態にする
                                          if (!isConfirming) {
                                            setDeleteConfirmKey(deleteKey);
                                            return;
                                          }

                                          // 2回目のクリック: 実際に削除
                                          try {
                                            const url = buildApiUrl(`/api/twitch/reward-counts/${reward.reward_id}/users/${index}`);
                                            const response = await fetch(url, { method: 'DELETE' });

                                            if (!response.ok) {
                                              const errorText = await response.text();
                                              throw new Error(`HTTP ${response.status}: ${errorText}`);
                                            }

                                            // 即座に再取得
                                            await fetchRewardCounts();
                                            setDeleteConfirmKey(null);
                                          } catch (error) {
                                            console.error('Failed to remove user:', error);
                                            toast.error(`ユーザー削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
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
        </CardContent>
      )}
    </Card>
  );
};
