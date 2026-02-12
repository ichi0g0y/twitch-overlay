import React, { useCallback, useMemo } from 'react';
import type { OverlaySettings } from '../../../contexts/SettingsContext';
import { MIN_CHROME_VERSION } from '@/utils/browserInfo';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TranslationItemBlock } from './TranslationItemBlock';
import {
  MAX_SLOTS, SLOT_DEFAULTS,
  buildRemoveUpdate, getActiveCount, normalizeMode, writeSlot,
} from './translationSlotKeys';

type Props = {
  overlaySettings: OverlaySettings | null;
  updateOverlaySettings: (updates: Partial<OverlaySettings>) => void;
};

export const MicTranslationSection: React.FC<Props> = ({ overlaySettings, updateOverlaySettings }) => {
  const translationMode = useMemo(
    () => normalizeMode(overlaySettings?.mic_transcript_translation_mode, overlaySettings?.mic_transcript_translation_enabled),
    [overlaySettings?.mic_transcript_translation_enabled, overlaySettings?.mic_transcript_translation_mode],
  );

  const activeCount = useMemo(
    () => getActiveCount(translationMode, overlaySettings),
    [translationMode, overlaySettings],
  );

  const handleModeChange = useCallback((value: string) => {
    const mode = value === 'chrome' ? 'chrome' : 'off';
    const updates: Record<string, unknown> = {
      mic_transcript_translation_mode: mode,
      mic_transcript_translation_enabled: mode !== 'off',
    };
    if (mode === 'chrome') {
      const lang = (overlaySettings?.mic_transcript_translation_language || '').trim();
      if (!lang) {
        Object.assign(updates, writeSlot(0, { language: 'en', ...SLOT_DEFAULTS }));
      }
    }
    updateOverlaySettings(updates as any);
  }, [overlaySettings, updateOverlaySettings]);

  const handleAdd = useCallback(() => {
    if (activeCount >= MAX_SLOTS) return;
    const updates: Record<string, unknown> = writeSlot(activeCount, { language: 'en', ...SLOT_DEFAULTS });
    if (activeCount === 0) {
      updates.mic_transcript_translation_mode = 'chrome';
      updates.mic_transcript_translation_enabled = true;
    }
    updateOverlaySettings(updates as any);
  }, [activeCount, updateOverlaySettings]);

  const handleRemove = useCallback((removeIndex: number) => {
    updateOverlaySettings(buildRemoveUpdate(removeIndex, activeCount, overlaySettings));
  }, [activeCount, overlaySettings, updateOverlaySettings]);

  const translationDisabled = translationMode === 'off';

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Chrome {MIN_CHROME_VERSION.translatorApi}+ で動作するだす
      </p>

      <div className="space-y-2">
        <Label>翻訳モード</Label>
        <Select value={translationMode} onValueChange={handleModeChange}>
          <SelectTrigger>
            <SelectValue placeholder="翻訳モードを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">OFF</SelectItem>
            <SelectItem value="chrome">Chrome内蔵翻訳（Translator API）</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!translationDisabled && (
        <>
          <div className="space-y-2">
            <Label>翻訳表示位置</Label>
            <Select
              value={overlaySettings?.mic_transcript_translation_position || (overlaySettings?.mic_transcript_position || 'bottom-left')}
              onValueChange={(v) => updateOverlaySettings({ mic_transcript_translation_position: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="表示位置を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-left">左下</SelectItem>
                <SelectItem value="bottom-center">中央下</SelectItem>
                <SelectItem value="bottom-right">右下</SelectItem>
                <SelectItem value="top-left">左上</SelectItem>
                <SelectItem value="top-center">中央上</SelectItem>
                <SelectItem value="top-right">右上</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {Array.from({ length: activeCount }, (_, i) => (
              <TranslationItemBlock
                key={i}
                index={i}
                slotIndex={i}
                overlaySettings={overlaySettings}
                updateOverlaySettings={updateOverlaySettings}
                onRemove={() => handleRemove(i)}
              />
            ))}
          </div>

          {activeCount < MAX_SLOTS && (
            <button
              type="button"
              className="w-full border border-dashed border-gray-700 rounded-lg py-2 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors cursor-pointer"
              onClick={handleAdd}
            >
              + 翻訳を追加（最大{MAX_SLOTS}つ）
            </button>
          )}
        </>
      )}
    </div>
  );
};
