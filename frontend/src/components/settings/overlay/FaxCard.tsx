import { Printer } from 'lucide-react';
import React from 'react';

import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface FaxCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  overlaySettings: any;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
}

export const FaxCard: React.FC<FaxCardProps> = ({
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
      panelId="settings.overlay.fax"
      cardKey="fax"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Printer className="w-4 h-4" />
          FAX表示
        </span>
      )}
      description="FAX受信時のアニメーション設定"
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="fax-enabled" className="flex flex-col">
          <span>FAXアニメーションを表示</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            FAX受信時にアニメーションを表示します
          </span>
        </Label>
        <Switch
          id="fax-enabled"
          checked={overlaySettings?.fax_enabled ?? true}
          onCheckedChange={(checked) =>
            updateOverlaySettings({ fax_enabled: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="fax-color-mode" className="flex flex-col">
          <span>カラーモード</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {overlaySettings?.fax_image_type === 'color'
              ? 'カラー: 鮮やかな表示'
              : 'モノクロ: クラシックなFAX風'}
          </span>
        </Label>
        <Switch
          id="fax-color-mode"
          checked={overlaySettings?.fax_image_type === 'color'}
          onCheckedChange={(checked) =>
            updateOverlaySettings({ fax_image_type: checked ? 'color' : 'mono' })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fax-speed">
          アニメーション速度: {((overlaySettings?.fax_animation_speed ?? 1.0) * 100).toFixed(0)}%
        </Label>
        <input
          type="range"
          id="fax-speed"
          min="50"
          max="200"
          value={(overlaySettings?.fax_animation_speed ?? 1.0) * 100}
          onChange={(e) =>
            updateOverlaySettings({ fax_animation_speed: parseInt(e.target.value, 10) / 100 })
          }
          className="w-full"
        />
      </div>
    </OverlayCardFrame>
  );
};
