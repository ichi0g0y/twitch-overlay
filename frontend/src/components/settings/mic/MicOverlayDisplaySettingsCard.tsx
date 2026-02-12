import React, { useContext } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { FontPicker } from './FontPicker';
import { MicTranslationSection } from './MicTranslationListCard';

export const MicOverlayDisplaySettingsCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicOverlayDisplaySettingsCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;
  const enabled = overlaySettings?.mic_transcript_enabled ?? false;

  const textAlignValue = (overlaySettings?.mic_transcript_text_align || '').trim() || '__auto__';
  const whiteSpaceValue = (overlaySettings?.mic_transcript_white_space || '').trim() || '__auto__';

  return (
    <Card>
      <CardHeader>
        <CardTitle>オーバーレイ表示（/overlay/）</CardTitle>
        <CardDescription>表示位置や幅、フォントなどを調整するだす</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>表示を有効化</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">受信した文字起こし（原文）をオーバーレイに表示するだす</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_enabled: checked })}
          />
        </div>

        {/* 原文 */}
        <details open className="rounded-lg border border-gray-800/60 p-4 space-y-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-200 select-none">原文</summary>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>表示位置</Label>
              <Select value={overlaySettings?.mic_transcript_position || 'bottom-left'} onValueChange={(value) => updateOverlaySettings({ mic_transcript_position: value })}>
                <SelectTrigger><SelectValue placeholder="表示位置を選択" /></SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="mic-max-width">最大幅（px, 0で無制限）</Label>
              <Input id="mic-max-width" type="number" min="0" max="4096" value={overlaySettings?.mic_transcript_max_width_px ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_max_width_px: parseInt(e.target.value, 10) || 0 })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mic-font-size">文字サイズ</Label>
              <Input id="mic-font-size" type="number" min="10" max="80" value={overlaySettings?.mic_transcript_font_size ?? 20} onChange={(e) => updateOverlaySettings({ mic_transcript_font_size: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mic-max-lines">最大行数</Label>
              <Input id="mic-max-lines" type="number" min="1" max="10" value={overlaySettings?.mic_transcript_max_lines ?? 3} onChange={(e) => updateOverlaySettings({ mic_transcript_max_lines: parseInt(e.target.value, 10) || 1 })} />
            </div>
            <div className="space-y-2">
              <Label>フォント</Label>
              <FontPicker value={overlaySettings?.mic_transcript_font_family ?? 'Noto Sans JP'} onChange={(v) => updateOverlaySettings({ mic_transcript_font_family: v })} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mic-text-color">文字色</Label>
              <Input id="mic-text-color" value={overlaySettings?.mic_transcript_text_color ?? '#ffffff'} onChange={(e) => updateOverlaySettings({ mic_transcript_text_color: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mic-stroke-color">縁取り色</Label>
              <Input id="mic-stroke-color" value={overlaySettings?.mic_transcript_stroke_color ?? '#000000'} onChange={(e) => updateOverlaySettings({ mic_transcript_stroke_color: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mic-stroke-width">縁取り幅(px)</Label>
              <Input id="mic-stroke-width" type="number" min="0" max="20" value={overlaySettings?.mic_transcript_stroke_width_px ?? 6} onChange={(e) => updateOverlaySettings({ mic_transcript_stroke_width_px: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mic-bg">背景色</Label>
              <Input id="mic-bg" placeholder="transparent" value={overlaySettings?.mic_transcript_background_color ?? 'transparent'} onChange={(e) => updateOverlaySettings({ mic_transcript_background_color: e.target.value })} />
            </div>
          </div>
        </details>

        {/* 翻訳 */}
        <details open className="rounded-lg border border-gray-800/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-200 select-none">
            翻訳（Chrome Translator API）
          </summary>
          <div className="mt-4">
            <MicTranslationSection overlaySettings={overlaySettings} updateOverlaySettings={updateOverlaySettings} />
          </div>
        </details>

        {/* 高度な設定 */}
        <details className="rounded-lg border border-gray-800/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-200 select-none">高度な設定</summary>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mic-frame-height">フレーム高さ（px, 0で自動）</Label>
                <Input id="mic-frame-height" type="number" min="0" max="4096" value={overlaySettings?.mic_transcript_frame_height_px ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_frame_height_px: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>縦揃え</Label>
                <Select value={(overlaySettings?.mic_transcript_v_align || '').trim() || 'bottom'} onValueChange={(value) => updateOverlaySettings({ mic_transcript_v_align: value })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="縦揃えを選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom">下（bottom）</SelectItem>
                    <SelectItem value="top">上（top）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>text-align</Label>
                <Select value={textAlignValue} onValueChange={(value) => updateOverlaySettings({ mic_transcript_text_align: value === '__auto__' ? '' : value })}>
                  <SelectTrigger><SelectValue placeholder="text-align を選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">自動</SelectItem>
                    <SelectItem value="left">left</SelectItem>
                    <SelectItem value="center">center</SelectItem>
                    <SelectItem value="right">right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>white-space</Label>
                <Select value={whiteSpaceValue} onValueChange={(value) => updateOverlaySettings({ mic_transcript_white_space: value === '__auto__' ? '' : value })}>
                  <SelectTrigger><SelectValue placeholder="white-space を選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">自動</SelectItem>
                    <SelectItem value="pre-wrap">pre-wrap</SelectItem>
                    <SelectItem value="pre-line">pre-line</SelectItem>
                    <SelectItem value="normal">normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mic-spacing-1">行間(1)（px）</Label>
                <Input id="mic-spacing-1" type="number" min="-30" max="60" value={overlaySettings?.mic_transcript_line_spacing_1_px ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_line_spacing_1_px: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-spacing-2">行間(2)（px）</Label>
                <Input id="mic-spacing-2" type="number" min="-30" max="60" value={overlaySettings?.mic_transcript_line_spacing_2_px ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_line_spacing_2_px: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-spacing-3">行間(3)（px）</Label>
                <Input id="mic-spacing-3" type="number" min="-30" max="60" value={overlaySettings?.mic_transcript_line_spacing_3_px ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_line_spacing_3_px: parseInt(e.target.value, 10) || 0 })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mic-marker-left">interimマーカー（左）</Label>
                <Input id="mic-marker-left" value={overlaySettings?.mic_transcript_interim_marker_left ?? ' << '} onChange={(e) => updateOverlaySettings({ mic_transcript_interim_marker_left: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-marker-right">interimマーカー（右）</Label>
                <Input id="mic-marker-right" value={overlaySettings?.mic_transcript_interim_marker_right ?? ' >>'} onChange={(e) => updateOverlaySettings({ mic_transcript_interim_marker_right: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mic-timer">自動クリア（ms, 0で無効）</Label>
              <Input id="mic-timer" type="number" min="0" max="600000" value={overlaySettings?.mic_transcript_timer_ms ?? 0} onChange={(e) => updateOverlaySettings({ mic_transcript_timer_ms: parseInt(e.target.value, 10) || 0 })} />
              <p className="text-xs text-gray-500 dark:text-gray-400">しばらく更新がないときに自動で消したい場合に使うだす</p>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
};
