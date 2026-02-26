import React from 'react';

import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { CacheSettingsModel } from './types';

interface CacheConfigCardProps {
  settings: CacheSettingsModel;
  updating: boolean;
  onChange: (key: keyof CacheSettingsModel, value: number | boolean) => void;
  onSave: () => void;
}

export const CacheConfigCard: React.FC<CacheConfigCardProps> = ({
  settings,
  updating,
  onChange,
  onSave,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.cache.config"
      title="キャッシュ設定"
      description="ダウンロードした画像のキャッシュ管理設定"
      contentClassName="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="expiry-days">有効期限（日数）</Label>
          <Input
            id="expiry-days"
            type="number"
            min="1"
            max="365"
            value={settings.expiry_days}
            onChange={(e) => onChange('expiry_days', parseInt(e.target.value, 10))}
            className="w-full"
          />
          <p className="text-sm text-gray-500">
            この日数を過ぎたキャッシュファイルが削除対象になります
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max-size">最大キャッシュサイズ（MB）</Label>
          <Input
            id="max-size"
            type="number"
            min="10"
            max="10000"
            value={settings.max_size_mb}
            onChange={(e) => onChange('max_size_mb', parseInt(e.target.value, 10))}
            className="w-full"
          />
          <p className="text-sm text-gray-500">
            この容量を超えると古いファイルから削除されます
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="cleanup-enabled">自動クリーンアップ</Label>
            <p className="text-sm text-gray-500">
              期限切れファイルの自動削除を有効にします
            </p>
          </div>
          <Switch
            id="cleanup-enabled"
            checked={settings.cleanup_enabled}
            onCheckedChange={(checked) => onChange('cleanup_enabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="cleanup-on-start">起動時クリーンアップ</Label>
            <p className="text-sm text-gray-500">
              アプリ起動時に自動クリーンアップを実行します
            </p>
          </div>
          <Switch
            id="cleanup-on-start"
            checked={settings.cleanup_on_start}
            onCheckedChange={(checked) => onChange('cleanup_on_start', checked)}
          />
        </div>
      </div>

      <div className="pt-4">
        <Button
          onClick={onSave}
          disabled={updating}
          className="w-full md:w-auto"
        >
          {updating ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </CollapsibleCard>
  );
};
