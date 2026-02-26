import { Bell, RefreshCw } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '../../ui/alert';
import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import type { GeneralSettingsNotificationProps } from './types';

export const NotificationSettingsCard: React.FC<GeneralSettingsNotificationProps> = ({
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  handleTestNotification,
  testingNotification,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.general.notification"
      title="通知設定"
      description="Twitchチャット受信時の通知ウィンドウ表示を設定します"
      contentClassName="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>チャット通知を有効化</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Twitchチャットを受信したときに通知ウィンドウを表示します
          </p>
        </div>
        <Switch
          checked={getBooleanValue('NOTIFICATION_ENABLED')}
          onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_ENABLED', checked)}
        />
      </div>

      {getBooleanValue('NOTIFICATION_ENABLED') && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="notification-mode">表示モード</Label>
              <Select
                value={getSettingValue('NOTIFICATION_DISPLAY_MODE') || 'queue'}
                onValueChange={(value) => handleSettingChange('NOTIFICATION_DISPLAY_MODE', value)}
              >
                <SelectTrigger id="notification-mode">
                  <SelectValue placeholder="表示モードを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">キュー表示（順番に表示）</SelectItem>
                  <SelectItem value="overwrite">上書き表示（最新のみ）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-duration">表示時間（秒）</Label>
              <Input
                id="notification-duration"
                type="number"
                min={1}
                max={60}
                value={getSettingValue('NOTIFICATION_DISPLAY_DURATION') || '5'}
                onChange={(e) => handleSettingChange('NOTIFICATION_DISPLAY_DURATION', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-font-size">通知文字サイズ</Label>
              <Input
                id="notification-font-size"
                type="number"
                min={10}
                max={48}
                value={getSettingValue('NOTIFICATION_FONT_SIZE') || '14'}
                onChange={(e) => handleSettingChange('NOTIFICATION_FONT_SIZE', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>通知ウィンドウを移動可能にする</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  通知上部のドラッグバーで移動できます
                </p>
              </div>
              <Switch
                checked={getBooleanValue('NOTIFICATION_WINDOW_MOVABLE')}
                onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_WINDOW_MOVABLE', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>通知ウィンドウをサイズ変更可能にする</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  右下ハンドルをドラッグしてサイズ変更できます
                </p>
              </div>
              <Switch
                checked={getBooleanValue('NOTIFICATION_WINDOW_RESIZABLE')}
                onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_WINDOW_RESIZABLE', checked)}
                disabled={!getBooleanValue('NOTIFICATION_WINDOW_MOVABLE')}
              />
            </div>
          </div>

          <Alert>
            <Bell className="h-4 w-4" />
            <AlertDescription>
              通知が有効です。Twitchチャットを受信すると通知ウィンドウに表示されます。
            </AlertDescription>
          </Alert>

          <div>
            <Button
              onClick={handleTestNotification}
              variant="outline"
              className="w-full"
              disabled={testingNotification}
            >
              {testingNotification ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  テスト送信中...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  テスト通知を送信
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              通知ウィンドウにテスト通知を表示します。
            </p>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
};
