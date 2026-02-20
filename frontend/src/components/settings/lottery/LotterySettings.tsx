import { Gift, Loader2, RefreshCw, Trophy } from 'lucide-react';
import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { LotteryRewardOption, LotteryRuntimeState } from './types';

type Props = {
  isLoading: boolean;
  runtimeState: LotteryRuntimeState;
  onRefreshOverview: () => void;
  onRefreshSubscribers?: () => void | Promise<void>;
  isRefreshingSubscribers?: boolean;
  subscriberWarning?: string | null;
  rewardOptions: LotteryRewardOption[];
  rewardId: string;
  isAuthenticated: boolean;
  onRewardChange: (value: string) => void | Promise<void>;
  onDraw: () => void | Promise<void>;
  isDrawing: boolean;
  onResetWinner: () => void | Promise<void>;
  isResettingWinner: boolean;
  lastWinner: string;
  baseLimit: number;
  finalLimit: number;
  onBaseLimitChange: (value: number) => void;
  onFinalLimitChange: (value: number) => void;
  onSaveLimits: () => void | Promise<void>;
  isSaving: boolean;
  statusMessage?: string;
};

export const LotterySettings: React.FC<Props> = ({
  isLoading,
  runtimeState,
  onRefreshOverview,
  onRefreshSubscribers,
  isRefreshingSubscribers = false,
  subscriberWarning = null,
  rewardOptions,
  rewardId,
  isAuthenticated,
  onRewardChange,
  onDraw,
  isDrawing,
  onResetWinner,
  isResettingWinner,
  lastWinner,
  baseLimit,
  finalLimit,
  onBaseLimitChange,
  onFinalLimitChange,
  onSaveLimits,
  isSaving,
  statusMessage,
}) => {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded border bg-gray-50 dark:bg-gray-900/30">
          <div>
            <p className="text-sm font-medium">抽選状態</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {runtimeState.is_running ? '実行中' : '待機中'} / 参加者 {runtimeState.participants_count} 人
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefreshOverview}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              更新
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void onRefreshSubscribers?.();
              }}
              disabled={!onRefreshSubscribers || isRefreshingSubscribers}
            >
              {isRefreshingSubscribers ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              サブスク更新
            </Button>
          </div>
        </div>
        {subscriberWarning && (
          <p className="rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            {subscriberWarning}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lottery-reward">抽選対象リワード</Label>
        {rewardOptions.length > 0 ? (
          <Select value={rewardId} onValueChange={onRewardChange}>
            <SelectTrigger id="lottery-reward">
              <SelectValue placeholder="リワードを選択..." />
            </SelectTrigger>
            <SelectContent>
              {rewardOptions.map((reward) => (
                <SelectItem key={reward.id} value={reward.id}>
                  {reward.title} ({reward.cost}pt)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-500 dark:text-gray-400">
            {isAuthenticated ? 'リワードを読み込み中...' : 'Twitchタブで認証してください'}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          このリワードを使用したユーザーが抽選対象になります
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Button
          type="button"
          onClick={onDraw}
          disabled={isDrawing || runtimeState.participants_count === 0}
        >
          {isDrawing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Gift className="w-4 h-4 mr-2" />
          )}
          抽選を実行
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onResetWinner}
          disabled={isResettingWinner || !lastWinner.trim()}
        >
          {isResettingWinner ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trophy className="w-4 h-4 mr-2" />
          )}
          前回当選者をリセット
        </Button>
      </div>

      <div className="p-3 rounded border bg-white dark:bg-gray-900/20">
        <p className="text-sm font-medium">前回当選者</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {lastWinner ? lastWinner : '未設定'}
        </p>
      </div>

      <div className="space-y-3 pt-4 border-t">
        <h4 className="text-sm font-medium">抽選オプション</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="lottery-base-limit">基本口数上限</Label>
            <Input
              id="lottery-base-limit"
              type="number"
              min={1}
              step={1}
              value={baseLimit}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                onBaseLimitChange(Number.isNaN(next) ? 1 : next);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lottery-final-limit">最終口数上限 (0=無制限)</Label>
            <Input
              id="lottery-final-limit"
              type="number"
              min={0}
              step={1}
              value={finalLimit}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                onFinalLimitChange(Number.isNaN(next) ? 0 : next);
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            最終口数上限を `0` にすると上限なしになります
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onSaveLimits}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存
          </Button>
        </div>
      </div>

      {statusMessage && (
        <p className="text-xs text-blue-600 dark:text-blue-400">{statusMessage}</p>
      )}
    </>
  );
};
