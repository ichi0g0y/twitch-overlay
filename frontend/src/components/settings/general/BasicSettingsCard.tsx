import React from 'react';

import { CollapsibleCard } from '../../ui/collapsible-card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import type { GeneralSettingsBasicProps } from './types';

export const BasicSettingsCard: React.FC<GeneralSettingsBasicProps> = ({
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  streamStatus,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.general.basic"
      title="基本設定"
      description="アプリケーションの基本的な動作を設定します"
      contentClassName="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="timezone">タイムゾーン</Label>
        <Select
          value={getSettingValue('TIMEZONE')}
          onValueChange={(value) => handleSettingChange('TIMEZONE', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="タイムゾーンを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
            <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
            <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
            <SelectItem value="UTC">UTC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>ドライランモード</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              実際の印刷を行わずテストします
            </p>
          </div>
          <Switch
            checked={getBooleanValue('DRY_RUN_MODE')}
            onCheckedChange={(checked) => handleSettingChange('DRY_RUN_MODE', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>オフライン時自動ドライラン</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              配信オフライン時に自動でドライランモードに切り替えます
            </p>
            {getBooleanValue('AUTO_DRY_RUN_WHEN_OFFLINE') && !getBooleanValue('DRY_RUN_MODE') && (
              <div className="mt-1">
                {streamStatus?.is_live ? (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    ✓ 配信中 - ドライラン無効
                  </span>
                ) : streamStatus === null ? (
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">
                    ⚠ 配信状態不明
                  </span>
                ) : (
                  <span className="text-xs text-orange-600 dark:text-orange-400">
                    ⚠ オフライン - ドライラン有効
                  </span>
                )}
              </div>
            )}
          </div>
          <Switch
            checked={getBooleanValue('AUTO_DRY_RUN_WHEN_OFFLINE')}
            onCheckedChange={(checked) => handleSettingChange('AUTO_DRY_RUN_WHEN_OFFLINE', checked)}
            disabled={getBooleanValue('DRY_RUN_MODE')}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>デバッグ出力</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            詳細なログを出力します
          </p>
        </div>
        <Switch
          checked={getBooleanValue('DEBUG_OUTPUT')}
          onCheckedChange={(checked) => handleSettingChange('DEBUG_OUTPUT', checked)}
        />
      </div>
    </CollapsibleCard>
  );
};
