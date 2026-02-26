import { Mic } from 'lucide-react';
import React from 'react';

import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface MicTranscriptCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  overlaySettings: any;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
}

export const MicTranscriptCard: React.FC<MicTranscriptCardProps> = ({
  column,
  focusCard,
  draggingCard,
  onDragStart,
  onDragEnd,
  preview,
  overlaySettings,
  updateOverlaySettings,
}) => {
  const translationModeValue =
    overlaySettings?.mic_transcript_translation_mode
    ?? ((overlaySettings?.mic_transcript_translation_enabled ?? false) ? 'chrome' : 'off');
  const translationEnabled = translationModeValue !== 'off';

  return (
    <OverlayCardFrame
      panelId="settings.overlay.mic-transcript"
      cardKey="micTranscript"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Mic className="w-4 h-4" />
          マイク
        </span>
      )}
      description="ダッシュボード（/）から送信した字幕をオーバーレイに表示するだす"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>表示を有効化</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">文字起こしを/overlayに表示するだす</p>
        </div>
        <Switch
          checked={overlaySettings?.mic_transcript_enabled ?? false}
          onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_enabled: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>翻訳を有効化</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">Translator API で翻訳して表示するだす</p>
        </div>
        <Switch
          checked={translationEnabled}
          onCheckedChange={(checked) =>
            updateOverlaySettings({
              mic_transcript_translation_mode: checked ? 'chrome' : 'off',
              mic_transcript_translation_enabled: checked,
            })}
        />
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">詳細設定は「マイク」タブで調整するだす</div>
    </OverlayCardFrame>
  );
};
