import { Printer } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '../../ui/alert';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { ClockPrintSettingsCardProps } from './types';

export const ClockPrintSettingsCard: React.FC<ClockPrintSettingsCardProps> = ({
  getBooleanValue,
  handleSettingChange,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.printer.clock"
      title="時計印刷設定"
      description="毎時0分の自動印刷を設定します"
      contentClassName="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>時計印刷を有効化</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            毎時0分に現在時刻を印刷します
          </p>
        </div>
        <Switch
          checked={getBooleanValue('CLOCK_ENABLED')}
          onCheckedChange={(checked) => handleSettingChange('CLOCK_ENABLED', checked)}
        />
      </div>

      {getBooleanValue('CLOCK_ENABLED') && (
        <Alert>
          <Printer className="h-4 w-4" />
          <AlertDescription>
            時計印刷が有効です。毎時0分に時刻が自動印刷されます。
            フォントが設定されていることを確認してください。
          </AlertDescription>
        </Alert>
      )}
    </CollapsibleCard>
  );
};
