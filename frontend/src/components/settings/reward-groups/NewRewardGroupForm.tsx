import React from 'react';

import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

interface NewRewardGroupFormProps {
  newGroupName: string;
  creatingGroup: boolean;
  onNewGroupNameChange: (name: string) => void;
  onCreateGroup: () => void;
  onCancel: () => void;
}

export const NewRewardGroupForm: React.FC<NewRewardGroupFormProps> = ({
  newGroupName,
  creatingGroup,
  onNewGroupNameChange,
  onCreateGroup,
  onCancel,
}) => {
  return (
    <div className="mb-4 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
      <Label htmlFor="new-group-name">グループ名</Label>
      <div className="flex items-center space-x-2 mt-2">
        <Input
          id="new-group-name"
          value={newGroupName}
          onChange={(e) => onNewGroupNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCreateGroup();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="グループ名を入力"
          disabled={creatingGroup}
          autoFocus
        />
        <Button
          onClick={onCreateGroup}
          disabled={!newGroupName.trim() || creatingGroup}
          size="sm"
        >
          {creatingGroup ? '作成中...' : '作成'}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          size="sm"
          disabled={creatingGroup}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
};
