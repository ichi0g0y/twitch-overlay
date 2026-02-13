import React, { useCallback } from 'react';
import type { OverlaySettings } from '../../../contexts/SettingsContext';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { FontPicker } from './FontPicker';
import { SLOT_KEYS, TRANSLATION_LANGUAGES, readSlot } from './translationSlotKeys';

type Props = {
  index: number; // 0-based visual index
  slotIndex: number;
  overlaySettings: OverlaySettings | null;
  updateOverlaySettings: (partial: Partial<OverlaySettings>) => void;
  onRemove: () => void;
};

export const TranslationItemBlock: React.FC<Props> = ({ index, slotIndex, overlaySettings, updateOverlaySettings, onRemove }) => {
  const vals = readSlot(overlaySettings, slotIndex);
  const keys = SLOT_KEYS[slotIndex];

  const update = useCallback(
    (key: keyof typeof keys, value: string | number) => {
      updateOverlaySettings({ [keys[key]]: value } as Partial<OverlaySettings>);
    },
    [keys, updateOverlaySettings],
  );

  return (
    <div className="border border-gray-800/60 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-200">翻訳 #{index + 1}</span>
        <button
          type="button"
          className="text-gray-500 hover:text-red-400 text-sm px-2 py-0.5 rounded hover:bg-gray-800 transition-colors cursor-pointer"
          onClick={onRemove}
          title="この翻訳を削除"
        >
          &times;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>翻訳先</Label>
          <Select value={vals.language || 'en'} onValueChange={(v) => update('language', v)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSLATION_LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>サイズ</Label>
          <Input
            type="number" min={10} max={80} className="h-9"
            value={vals.font_size}
            onChange={(e) => update('font_size', parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label>weight</Label>
          <Input
            type="number" min={100} max={900} step={100} className="h-9"
            value={vals.font_weight}
            onChange={(e) => update('font_weight', parseInt(e.target.value, 10) || 400)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>フォント</Label>
        <FontPicker value={vals.font_family} onChange={(v) => update('font_family', v)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>文字色</Label>
          <Input className="h-9" value={vals.text_color} onChange={(e) => update('text_color', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>縁取り色</Label>
          <Input className="h-9" value={vals.stroke_color} onChange={(e) => update('stroke_color', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>縁取り幅(px)</Label>
          <Input
            type="number" min={0} max={20} className="h-9"
            value={vals.stroke_width_px}
            onChange={(e) => update('stroke_width_px', parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
    </div>
  );
};
