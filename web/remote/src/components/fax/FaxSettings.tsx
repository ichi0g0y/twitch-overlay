import React from 'react';
import { useRemote } from '../../contexts/RemoteContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FaxSettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const FaxSettings: React.FC<FaxSettingsProps> = ({ isExpanded, onToggle }) => {
  const { overlaySettings, updateOverlaySettings } = useRemote();

  return (
    <Card className="break-inside-avoid mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle>FAX表示</CardTitle>
            <CardDescription>
              FAX受信時のアニメーション設定
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
                updateOverlaySettings({ fax_animation_speed: parseInt(e.target.value) / 100 })
              }
              className="w-full"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
};
