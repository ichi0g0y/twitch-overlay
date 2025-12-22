import React from 'react';
import { useRemote } from '../../contexts/RemoteContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ClockSettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const ClockSettings: React.FC<ClockSettingsProps> = ({ isExpanded, onToggle }) => {
  const { overlaySettings, updateOverlaySettings } = useRemote();

  return (
    <Card className="break-inside-avoid mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle>時計表示</CardTitle>
            <CardDescription>
              オーバーレイの時計表示設定
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="clock-enabled" className="flex flex-col">
              <span>時計を表示</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                オーバーレイに時計を表示します
              </span>
            </Label>
            <Switch
              id="clock-enabled"
              checked={overlaySettings?.clock_enabled ?? true}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ clock_enabled: checked })
              }
            />
          </div>

          {(overlaySettings?.clock_enabled ?? true) && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="location-enabled" className="flex flex-col">
                  <span>場所を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Hyogo, Japan
                  </span>
                </Label>
                <Switch
                  id="location-enabled"
                  checked={overlaySettings?.location_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ location_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="date-enabled" className="flex flex-col">
                  <span>日付を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    年月日と曜日
                  </span>
                </Label>
                <Switch
                  id="date-enabled"
                  checked={overlaySettings?.date_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ date_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="time-enabled" className="flex flex-col">
                  <span>時刻を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    時:分
                  </span>
                </Label>
                <Switch
                  id="time-enabled"
                  checked={overlaySettings?.time_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ time_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="clock-show-icons" className="flex flex-col">
                  <span>アイコンを表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    場所・日付・時刻のアイコン
                  </span>
                </Label>
                <Switch
                  id="clock-show-icons"
                  checked={overlaySettings?.clock_show_icons ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ clock_show_icons: checked })
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
};
