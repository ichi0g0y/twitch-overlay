import { Printer, RefreshCw, Wifi } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '../../ui/alert';
import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { UsbSettingsCardProps } from './types';

export const UsbSettingsCard: React.FC<UsbSettingsCardProps> = ({
  printerType,
  isSingleSectionMode,
  getSettingValue,
  handleSettingChange,
  handleTestConnection,
  testing,
  systemPrinters,
  loadingSystemPrinters,
  handleRefreshSystemPrinters,
}) => {
  if (!(printerType === 'usb' || isSingleSectionMode)) {
    return null;
  }

  return (
    <CollapsibleCard
      panelId="settings.printer.usb"
      title="USBプリンター設定"
      description="システムに登録されているプリンターから選択します"
      contentClassName="space-y-4"
    >
      {printerType !== 'usb' ? (
        <Alert>
          <AlertDescription>
            このカードは USB プリンター設定です。現在のプリンター種類は Bluetooth です。
            <Button
              onClick={() => handleSettingChange('PRINTER_TYPE', 'usb')}
              size="sm"
              variant="outline"
              className="ml-3"
            >
              USB に切り替える
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Label>システムプリンター</Label>
            <Button
              onClick={handleRefreshSystemPrinters}
              disabled={loadingSystemPrinters}
              size="sm"
              variant="outline"
            >
              {loadingSystemPrinters ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  読込中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  更新
                </>
              )}
            </Button>
          </div>

          {systemPrinters.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="usb-printer">プリンター選択</Label>
              <Select
                value={getSettingValue('USB_PRINTER_NAME')}
                onValueChange={(value) => handleSettingChange('USB_PRINTER_NAME', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="プリンターを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {systemPrinters.map((printer) => (
                    <SelectItem key={printer.name} value={printer.name}>
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <Printer className="w-4 h-4" />
                          <span className="font-medium">{printer.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-6">
                          {printer.status}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {getSettingValue('USB_PRINTER_NAME') && (
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

          {systemPrinters.length === 0 && !loadingSystemPrinters && (
            <Alert>
              <AlertDescription>
                システムプリンターが見つかりません。
                システム設定でプリンターを追加してください。
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </CollapsibleCard>
  );
};
