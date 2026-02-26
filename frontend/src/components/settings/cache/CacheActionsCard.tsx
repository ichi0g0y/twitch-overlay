import { Trash2 } from 'lucide-react';
import React from 'react';

import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';

interface CacheActionsCardProps {
  cleaning: boolean;
  clearing: boolean;
  onCleanupExpired: () => void;
  onClearCache: () => void;
}

export const CacheActionsCard: React.FC<CacheActionsCardProps> = ({
  cleaning,
  clearing,
  onCleanupExpired,
  onClearCache,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.cache.actions"
      title={(
        <span className="flex items-center space-x-2">
          <Trash2 className="w-5 h-5" />
          <span>キャッシュ管理</span>
        </span>
      )}
      description="キャッシュファイルの手動削除操作"
    >
      <div className="flex flex-col md:flex-row gap-4">
        <Button
          variant="outline"
          onClick={onCleanupExpired}
          disabled={cleaning}
          className="flex items-center space-x-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>{cleaning ? '削除中...' : '期限切れファイルを削除'}</span>
        </Button>

        <Button
          variant="destructive"
          onClick={onClearCache}
          disabled={clearing}
          className="flex items-center space-x-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>{clearing ? 'クリア中...' : 'すべてのキャッシュをクリア'}</span>
        </Button>
      </div>
    </CollapsibleCard>
  );
};
