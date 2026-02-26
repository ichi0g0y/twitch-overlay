import { Edit2, Loader2, Trash2 } from 'lucide-react';
import React from 'react';

import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { RewardGroup } from './types';

interface RewardGroupItemProps {
  group: RewardGroup;
  activeRewardCount: number;
  editingGroupId: number | null;
  editingGroupName: string;
  togglingGroupId: number | null;
  onEditingNameChange: (name: string) => void;
  onUpdateGroup: (groupId: number) => void;
  onCancelEditing: () => void;
  onStartEditing: (group: RewardGroup) => void;
  onToggleGroup: (groupId: number, enabled: boolean) => void;
  onDeleteGroup: (groupId: number) => void;
}

export const RewardGroupItem: React.FC<RewardGroupItemProps> = ({
  group,
  activeRewardCount,
  editingGroupId,
  editingGroupName,
  togglingGroupId,
  onEditingNameChange,
  onUpdateGroup,
  onCancelEditing,
  onStartEditing,
  onToggleGroup,
  onDeleteGroup,
}) => {
  return (
    <div className="border dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {editingGroupId === group.id ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editingGroupName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onUpdateGroup(group.id);
                  if (e.key === 'Escape') onCancelEditing();
                }}
                className="max-w-xs"
                autoFocus
              />
              <Button
                onClick={() => onUpdateGroup(group.id)}
                size="sm"
                disabled={!editingGroupName.trim()}
              >
                保存
              </Button>
              <Button
                onClick={onCancelEditing}
                variant="outline"
                size="sm"
              >
                キャンセル
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <h3 className="font-semibold dark:text-white">{group.name}</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {activeRewardCount}個のリワード
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
                    onCheckedChange={(checked) => onToggleGroup(group.id, checked)}
                    disabled={togglingGroupId !== null}
                  />
                </>
              )}
            </div>
            <Button
              onClick={() => onStartEditing(group)}
              variant="ghost"
              size="sm"
              disabled={togglingGroupId !== null}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => onDeleteGroup(group.id)}
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
  );
};
