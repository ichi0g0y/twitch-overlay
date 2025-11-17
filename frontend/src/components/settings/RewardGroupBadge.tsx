import React from 'react';
import { X } from 'lucide-react';

interface RewardGroupBadgeProps {
  groupName: string;
  onRemove?: () => void;
  disabled?: boolean;
}

export const RewardGroupBadge: React.FC<RewardGroupBadgeProps> = ({
  groupName,
  onRemove,
  disabled = false,
}) => {
  return (
    <span className="inline-flex items-center space-x-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded border border-purple-200 dark:border-purple-800">
      <span>{groupName}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          className="hover:bg-purple-200 dark:hover:bg-purple-800 rounded p-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="グループから削除"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};
