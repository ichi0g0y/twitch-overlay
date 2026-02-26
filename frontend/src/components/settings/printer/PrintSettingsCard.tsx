import React from 'react';

import { CollapsibleCard } from '../../ui/collapsible-card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { PrintSettingsCardProps } from './types';

export const PrintSettingsCard: React.FC<PrintSettingsCardProps> = ({
  printerType,
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.printer.print"
      title="印刷設定"
      description={
        printerType === 'bluetooth'
          ? 'Bluetoothプリンターの印刷品質と動作を設定します'
          : 'プリンターの印刷設定'
      }
      contentClassName="space-y-6"
    >
      {printerType === 'bluetooth' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>最高品質で印刷</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                より鮮明な印刷（遅い）
              </p>
            </div>
            <Switch
              checked={getBooleanValue('BEST_QUALITY')}
              onCheckedChange={(checked) => handleSettingChange('BEST_QUALITY', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>ディザリング</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                グレースケール表現を改善
              </p>
            </div>
            <Switch
              checked={getBooleanValue('DITHER')}
              onCheckedChange={(checked) => handleSettingChange('DITHER', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>自動回転</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                画像を自動的に最適な向きに
              </p>
            </div>
            <Switch
              checked={getBooleanValue('AUTO_ROTATE')}
              onCheckedChange={(checked) => handleSettingChange('AUTO_ROTATE', checked)}
            />
          </div>
        </div>
      )}

      {printerType === 'bluetooth' && (
        <div className="space-y-2">
          <Label htmlFor="black-point">
            黒レベル調整: {getSettingValue('BLACK_POINT') || '0.5'}
          </Label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              id="black-point"
              min="0"
              max="1"
              step="0.01"
              value={getSettingValue('BLACK_POINT') || '0.5'}
              onChange={(e) => handleSettingChange('BLACK_POINT', e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400 w-12">
              {getSettingValue('BLACK_POINT') || '0.5'}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            低い値ほど薄い色も黒として印刷されます (0.0-1.0)
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>180度回転</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            プリンター設置向きに合わせる
          </p>
        </div>
        <Switch
          checked={getBooleanValue('ROTATE_PRINT')}
          onCheckedChange={(checked) => handleSettingChange('ROTATE_PRINT', checked)}
        />
      </div>
    </CollapsibleCard>
  );
};
