import { Check, Copy, Edit2, Save, Trash2, X } from 'lucide-react';
import React from 'react';

import { AddToGroupDropdown } from '../AddToGroupDropdown';
import { RewardGroupBadge } from '../RewardGroupBadge';
import type { RewardGroup } from '../RewardGroupsManager';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import type { CustomReward } from './types';

interface CustomRewardCardProps {
  reward: CustomReward;
  groups: RewardGroup[];
  copiedId: string | null;
  deleteClickedId: string | null;
  editingDisplayName: string | null;
  editingDisplayNameValue: string;
  onToggleReward: (rewardId: string, currentEnabled: boolean) => void;
  onDeleteClick: (rewardId: string) => void;
  onRemoveFromGroup: (rewardId: string, groupId: number) => void;
  onAddedToGroup: () => void;
  onCopyId: (id: string) => void;
  onStartEditDisplayName: (reward: CustomReward) => void;
  onDisplayNameValueChange: (value: string) => void;
  onSaveDisplayName: (rewardId: string, displayName: string) => void;
  onCancelEditDisplayName: () => void;
}

export const CustomRewardCard: React.FC<CustomRewardCardProps> = ({
  reward,
  groups,
  copiedId,
  deleteClickedId,
  editingDisplayName,
  editingDisplayNameValue,
  onToggleReward,
  onDeleteClick,
  onRemoveFromGroup,
  onAddedToGroup,
  onCopyId,
  onStartEditDisplayName,
  onDisplayNameValueChange,
  onSaveDisplayName,
  onCancelEditDisplayName,
}) => {
  return (
    <div
      className="border dark:border-gray-700 rounded-lg p-4 transition-colors relative"
    >
      <div className="absolute top-4 right-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {reward.is_enabled ? 'ON' : 'OFF'}
          </span>
          <div className="relative inline-block w-10 h-5">
            <input
              type="checkbox"
              checked={reward.is_enabled}
              onChange={() => onToggleReward(reward.id, reward.is_enabled)}
              className="sr-only peer"
            />
            <div className={`w-10 h-5 rounded-full transition-colors ${
              reward.is_enabled
                ? 'bg-blue-600'
                : 'bg-gray-300 dark:bg-gray-600'
            }`} />
            <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              reward.is_enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </div>
        </label>
      </div>

      <div className="flex items-start space-x-3 pr-24">
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
                    onDeleteClick(reward.id);
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

          <div className="flex items-center flex-wrap gap-2">
            {groups.map((group) => (
              <RewardGroupBadge
                key={group.id}
                groupName={group.name}
                onRemove={() => onRemoveFromGroup(reward.id, group.id)}
              />
            ))}
            <AddToGroupDropdown
              rewardId={reward.id}
              currentGroups={groups}
              onAdded={onAddedToGroup}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 dark:text-gray-400">
            <span>ID:</span>
            <span className="select-all">{reward.id}</span>
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onCopyId(reward.id);
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

        <div className="mb-3">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            カスタム表示名 (リワードカウント表示用)
          </div>
          {editingDisplayName === reward.id ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editingDisplayNameValue}
                onChange={(e) => onDisplayNameValueChange(e.target.value)}
                placeholder={reward.title}
                className="flex-1 h-8 text-sm"
                autoFocus
              />
              <Button
                onClick={() => onSaveDisplayName(reward.id, editingDisplayNameValue)}
                variant="default"
                size="sm"
                className="h-8 px-2"
              >
                <Save className="w-3 h-3" />
              </Button>
              <Button
                onClick={onCancelEditDisplayName}
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
                onClick={() => onStartEditDisplayName(reward)}
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
};
