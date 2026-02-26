import { Clock } from 'lucide-react';
import React from 'react';

import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface ClockCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  overlaySettings: any;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
}

export const ClockCard: React.FC<ClockCardProps> = ({
  column,
  focusCard,
  draggingCard,
  onDragStart,
  onDragEnd,
  preview,
  overlaySettings,
  updateOverlaySettings,
}) => {
  return (
    <OverlayCardFrame
      panelId="settings.overlay.clock"
      cardKey="clock"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          時計表示
        </span>
      )}
      description="オーバーレイの時計表示設定"
    >
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
              <span className="text-xs text-gray-500 dark:text-gray-400">Hyogo, Japan</span>
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
              <span className="text-xs text-gray-500 dark:text-gray-400">年月日と曜日</span>
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
              <span className="text-xs text-gray-500 dark:text-gray-400">時:分</span>
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
              <span className="text-xs text-gray-500 dark:text-gray-400">場所・日付・時刻のアイコン</span>
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
    </OverlayCardFrame>
  );
};
