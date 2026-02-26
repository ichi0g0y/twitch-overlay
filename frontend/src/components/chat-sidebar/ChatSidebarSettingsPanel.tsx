import React from 'react';
import { FONT_MAX_SIZE, FONT_MIN_SIZE } from './utils';
import { Switch } from '../ui/switch';

export const ChatSidebarSettingsPanel: React.FC<{
  fontSize: number;
  translationEnabled: boolean;
  notificationOverwrite: boolean;
  onFontSizeChange: (size: number) => void;
  onTranslationToggle: (enabled: boolean) => void;
  onNotificationModeToggle: (enabled: boolean) => void;
  settingsPanelRef: React.MutableRefObject<HTMLDivElement | null>;
}> = ({
  fontSize,
  translationEnabled,
  notificationOverwrite,
  onFontSizeChange,
  onTranslationToggle,
  onNotificationModeToggle,
  settingsPanelRef,
}) => {
  return (
    <div
      ref={settingsPanelRef}
      className="absolute right-2 top-10 z-20 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-sm"
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">文字サイズ</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={FONT_MIN_SIZE}
              max={FONT_MAX_SIZE}
              value={fontSize}
              onChange={(event) => onFontSizeChange(Number(event.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right text-sm text-gray-600 dark:text-gray-300">{fontSize}px</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">翻訳</div>
          <Switch checked={translationEnabled} onCheckedChange={onTranslationToggle} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">通知上書き</div>
          <Switch checked={notificationOverwrite} onCheckedChange={onNotificationModeToggle} />
        </div>
      </div>
    </div>
  );
};
