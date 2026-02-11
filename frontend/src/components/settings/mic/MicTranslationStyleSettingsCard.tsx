import React, { useContext } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

export const MicTranslationStyleSettingsCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicTranslationStyleSettingsCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;

  const mode = (overlaySettings?.mic_transcript_translation_mode || '').trim();
  const translationEnabled = mode ? mode !== 'off' : (overlaySettings?.mic_transcript_translation_enabled ?? false);
  const translation2Value = (overlaySettings?.mic_transcript_translation2_language || '').trim() || '__none__';
  const translation3Value = (overlaySettings?.mic_transcript_translation3_language || '').trim() || '__none__';

  const disableT1 = !translationEnabled;
  const disableT2 = !translationEnabled || translation2Value === '__none__';
  const disableT3 = !translationEnabled || translation3Value === '__none__';

  return (
    <Card>
      <CardHeader>
        <CardTitle>翻訳 表示スタイル</CardTitle>
        <CardDescription>翻訳(1)-(3)の色/フォント/strokeなどを調整するだす</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="text-sm font-medium">翻訳(1)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t1-weight">weight</Label>
              <Input
                id="t1-weight"
                type="number"
                min="100"
                max="1000"
                value={overlaySettings?.mic_transcript_translation_font_weight ?? 900}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation_font_weight: parseInt(e.target.value, 10) || 0 })}
                disabled={disableT1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t1-color">color</Label>
              <Input
                id="t1-color"
                value={overlaySettings?.mic_transcript_translation_text_color ?? '#ffffff'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation_text_color: e.target.value })}
                disabled={disableT1}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t1-font">font-family</Label>
              <Input
                id="t1-font"
                value={overlaySettings?.mic_transcript_translation_font_family ?? 'Noto Sans JP'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation_font_family: e.target.value })}
                disabled={disableT1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t1-stroke-color">stroke color</Label>
              <Input
                id="t1-stroke-color"
                value={overlaySettings?.mic_transcript_translation_stroke_color ?? '#000000'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation_stroke_color: e.target.value })}
                disabled={disableT1}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t1-stroke-width">stroke width（px）</Label>
            <Input
              id="t1-stroke-width"
              type="number"
              min="0"
              max="20"
              value={overlaySettings?.mic_transcript_translation_stroke_width_px ?? 6}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation_stroke_width_px: parseInt(e.target.value, 10) || 0 })}
              disabled={disableT1}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">翻訳(2)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t2-weight">weight</Label>
              <Input
                id="t2-weight"
                type="number"
                min="100"
                max="1000"
                value={overlaySettings?.mic_transcript_translation2_font_weight ?? 900}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_font_weight: parseInt(e.target.value, 10) || 0 })}
                disabled={disableT2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t2-color">color</Label>
              <Input
                id="t2-color"
                value={overlaySettings?.mic_transcript_translation2_text_color ?? '#ffffff'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_text_color: e.target.value })}
                disabled={disableT2}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t2-font">font-family</Label>
              <Input
                id="t2-font"
                value={overlaySettings?.mic_transcript_translation2_font_family ?? 'Noto Sans JP'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_font_family: e.target.value })}
                disabled={disableT2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t2-stroke-color">stroke color</Label>
              <Input
                id="t2-stroke-color"
                value={overlaySettings?.mic_transcript_translation2_stroke_color ?? '#000000'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_stroke_color: e.target.value })}
                disabled={disableT2}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t2-stroke-width">stroke width（px）</Label>
            <Input
              id="t2-stroke-width"
              type="number"
              min="0"
              max="20"
              value={overlaySettings?.mic_transcript_translation2_stroke_width_px ?? 6}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_stroke_width_px: parseInt(e.target.value, 10) || 0 })}
              disabled={disableT2}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">翻訳(3)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t3-weight">weight</Label>
              <Input
                id="t3-weight"
                type="number"
                min="100"
                max="1000"
                value={overlaySettings?.mic_transcript_translation3_font_weight ?? 900}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_font_weight: parseInt(e.target.value, 10) || 0 })}
                disabled={disableT3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t3-color">color</Label>
              <Input
                id="t3-color"
                value={overlaySettings?.mic_transcript_translation3_text_color ?? '#ffffff'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_text_color: e.target.value })}
                disabled={disableT3}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t3-font">font-family</Label>
              <Input
                id="t3-font"
                value={overlaySettings?.mic_transcript_translation3_font_family ?? 'Noto Sans JP'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_font_family: e.target.value })}
                disabled={disableT3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t3-stroke-color">stroke color</Label>
              <Input
                id="t3-stroke-color"
                value={overlaySettings?.mic_transcript_translation3_stroke_color ?? '#000000'}
                onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_stroke_color: e.target.value })}
                disabled={disableT3}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t3-stroke-width">stroke width（px）</Label>
            <Input
              id="t3-stroke-width"
              type="number"
              min="0"
              max="20"
              value={overlaySettings?.mic_transcript_translation3_stroke_width_px ?? 6}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_stroke_width_px: parseInt(e.target.value, 10) || 0 })}
              disabled={disableT3}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

