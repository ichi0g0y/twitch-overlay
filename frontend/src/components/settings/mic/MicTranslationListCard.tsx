import React, { useCallback, useContext, useMemo } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { MIN_CHROME_VERSION } from '@/utils/browserInfo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TranslationItemBlock } from './TranslationItemBlock';
import {
  MAX_SLOTS, SLOT_DEFAULTS,
  buildRemoveUpdate, getActiveCount, normalizeMode, writeSlot,
} from './translationSlotKeys';

export const MicTranslationListCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicTranslationListCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;

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
    // chrome選択時にスロット0が空なら初期値を設定
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
    const slot = activeCount; // next empty slot
    const updates: Record<string, unknown> = writeSlot(slot, { language: 'en', ...SLOT_DEFAULTS });
    // 最初のアイテム追加時はモードもchromeに
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
    <Card>
      <CardHeader>
        <CardTitle>翻訳（Chrome Translator API）</CardTitle>
        <CardDescription>
          Translator API が利用可能なChrome環境でのみ動作するだす（目安: Chrome {MIN_CHROME_VERSION.translatorApi}+）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <Label>表示位置</Label>
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
      </CardContent>
    </Card>
  );
};
