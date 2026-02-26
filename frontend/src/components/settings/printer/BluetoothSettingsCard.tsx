import { Bluetooth, RefreshCw, Wifi } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '../../ui/alert';
import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import type { BluetoothSettingsCardProps } from './types';

export const BluetoothSettingsCard: React.FC<BluetoothSettingsCardProps> = ({
  printerType,
  isSingleSectionMode,
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  handleTestConnection,
  testing,
  bluetoothDevices,
  scanning,
  handleScanDevices,
}) => {
  if (!(printerType === 'bluetooth' || isSingleSectionMode)) {
    return null;
  }

  return (
    <CollapsibleCard
      panelId="settings.printer.bluetooth"
      title="プリンター接続設定"
      description="CatPrinterのBluetooth接続を設定します"
      contentClassName="space-y-6"
    >
      {printerType !== 'bluetooth' ? (
        <Alert>
          <AlertDescription>
            このカードは Bluetooth プリンター設定です。現在のプリンター種類は USB です。
            <Button
              onClick={() => handleSettingChange('PRINTER_TYPE', 'bluetooth')}
              size="sm"
              variant="outline"
              className="ml-3"
            >
              Bluetooth に切り替える
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Bluetoothデバイス</Label>
              <Button
                onClick={handleScanDevices}
                disabled={scanning}
                size="sm"
                variant="outline"
              >
                {scanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    スキャン中...
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4 mr-2" />
                    デバイススキャン
                  </>
                )}
              </Button>
            </div>

            {bluetoothDevices.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="printer-address">プリンターアドレス</Label>
                <Select
                  value={getSettingValue('PRINTER_ADDRESS')}
                  onValueChange={(value) => handleSettingChange('PRINTER_ADDRESS', value)}
                  disabled={scanning}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="デバイスを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {bluetoothDevices.map((device) => (
                      <SelectItem key={device.mac_address} value={device.mac_address}>
                        <div className="flex items-center space-x-2">
                          <Bluetooth className="w-4 h-4" />
                          <span>
                            {device.name || 'Unknown Device'} ({device.mac_address})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {getSettingValue('PRINTER_ADDRESS') && (
              <div className="flex space-x-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={testing}
                  variant="outline"
                  className="flex-1"
                >
                  {testing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      テスト中...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 mr-2" />
                      接続テスト
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-address">
              手動でアドレス入力
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                (例: AA:BB:CC:DD:EE:FF)
              </span>
            </Label>
            <Input
              id="manual-address"
              type="text"
              placeholder="MACアドレスを入力"
              value={getSettingValue('PRINTER_ADDRESS')}
              onChange={(e) => handleSettingChange('PRINTER_ADDRESS', e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>KeepAlive機能</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  長時間接続を維持するため定期的に再接続します
                </p>
              </div>
              <Switch
                checked={getBooleanValue('KEEP_ALIVE_ENABLED')}
                onCheckedChange={(checked) => handleSettingChange('KEEP_ALIVE_ENABLED', checked)}
              />
            </div>

            {getBooleanValue('KEEP_ALIVE_ENABLED') && (
              <div className="space-y-2">
                <Label htmlFor="keepalive-interval">
                  KeepAlive間隔（秒）: {getSettingValue('KEEP_ALIVE_INTERVAL') || '60'}
                </Label>
                <Input
                  id="keepalive-interval"
                  type="number"
                  min="10"
                  max="3600"
                  value={getSettingValue('KEEP_ALIVE_INTERVAL') || '60'}
                  onChange={(e) => handleSettingChange('KEEP_ALIVE_INTERVAL', e.target.value)}
                  className="w-32"
                />
              </div>
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
};
