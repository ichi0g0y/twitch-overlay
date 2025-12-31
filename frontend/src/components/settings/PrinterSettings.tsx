import React, { useContext } from 'react';
import { Bluetooth, Printer, RefreshCw, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { SettingsPageContext } from '../../hooks/useSettingsPage';

export const PrinterSettings: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('PrinterSettings must be used within SettingsPageProvider');
  }

  const {
    getSettingValue,
    handleSettingChange,
    getBooleanValue,
    bluetoothDevices,
    scanning,
    testing,
    handleScanDevices,
    handleTestConnection,
  } = context;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>プリンター接続設定</CardTitle>
          <CardDescription>
            CatPrinterのBluetooth接続を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bluetooth デバイススキャン */}
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

          {/* 手動アドレス入力 */}
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

          {/* KeepAlive設定 */}
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
        </CardContent>
      </Card>

      {/* 印刷設定 */}
      <Card>
        <CardHeader>
          <CardTitle>印刷設定</CardTitle>
          <CardDescription>
            プリンターの印刷品質と動作を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
          </div>

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
        </CardContent>
      </Card>

      {/* 時計印刷設定 */}
      <Card>
        <CardHeader>
          <CardTitle>時計印刷設定</CardTitle>
          <CardDescription>
            毎時0分の自動印刷を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
        </CardContent>
      </Card>
    </div>
  );
};