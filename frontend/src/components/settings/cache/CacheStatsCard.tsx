import { HardDrive } from 'lucide-react';
import React from 'react';

import { CollapsibleCard } from '../../ui/collapsible-card';
import type { CacheStatsModel } from './types';

interface CacheStatsCardProps {
  stats: CacheStatsModel;
}

export const CacheStatsCard: React.FC<CacheStatsCardProps> = ({ stats }) => {
  return (
    <CollapsibleCard
      panelId="settings.cache.stats"
      title={(
        <span className="flex items-center space-x-2">
          <HardDrive className="w-5 h-5" />
          <span>キャッシュ統計</span>
        </span>
      )}
      description="現在のキャッシュ使用状況"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.total_files}
          </div>
          <div className="text-sm text-gray-500">ファイル数</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {(stats.total_size_bytes / 1024 / 1024).toFixed(1)} MB
          </div>
          <div className="text-sm text-gray-500">使用容量</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-gray-600 dark:text-gray-400">
            {stats.oldest_file_date ? new Date(stats.oldest_file_date).toLocaleDateString() : '-'}
          </div>
          <div className="text-sm text-gray-500">最古ファイル</div>
        </div>
      </div>
    </CollapsibleCard>
  );
};
