import React, { useContext, useMemo } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { MIN_CHROME_VERSION } from '@/utils/browserInfo';

function normalizeMode(mode: string | undefined | null, legacyEnabled: boolean | undefined | null): 'off' | 'chrome' {
  const raw = (mode || '').trim();
  if (raw === 'chrome') return 'chrome';
  if (raw === 'off') return 'off';
  return legacyEnabled ? 'chrome' : 'off';
}

export const MicTranslationSettingsCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicTranslationSettingsCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;

  const translationMode = useMemo(
    () => normalizeMode(overlaySettings?.mic_transcript_translation_mode, overlaySettings?.mic_transcript_translation_enabled),
    [overlaySettings?.mic_transcript_translation_enabled, overlaySettings?.mic_transcript_translation_mode],
  );
  const translationDisabled = translationMode === 'off';
  const translation2Value = (overlaySettings?.mic_transcript_translation2_language || '').trim() || '__none__';
  const translation3Value = (overlaySettings?.mic_transcript_translation3_language || '').trim() || '__none__';

  const translationLangOptions = (
    <>
      <SelectItem value="ja">日本語（ja）</SelectItem>
      <SelectItem value="en">英語（en）</SelectItem>
      <SelectItem value="ko">韓国語（ko）</SelectItem>
      <SelectItem value="zh">中国語(簡)（zh）</SelectItem>
      <SelectItem value="zh-Hant">中国語(繁)（zh-Hant）</SelectItem>
      <SelectItem value="fr">フランス語（fr）</SelectItem>
      <SelectItem value="it">イタリア語（it）</SelectItem>
      <SelectItem value="de">ドイツ語（de）</SelectItem>
      <SelectItem value="tr">トルコ語（tr）</SelectItem>
      <SelectItem value="sv">スウェーデン語（sv）</SelectItem>
      <SelectItem value="pl">ポーランド語（pl）</SelectItem>
      <SelectItem value="uk">ウクライナ語（uk）</SelectItem>
      <SelectItem value="ru">ロシア語（ru）</SelectItem>
      <SelectItem value="es">スペイン語（es）</SelectItem>
      <SelectItem value="pt">ポルトガル語（pt）</SelectItem>
      <SelectItem value="nl">オランダ語（nl）</SelectItem>
      <SelectItem value="id">インドネシア語（id）</SelectItem>
      <SelectItem value="vi">ベトナム語（vi）</SelectItem>
      <SelectItem value="th">タイ語（th）</SelectItem>
      <SelectItem value="ar">アラビア語（ar）</SelectItem>
      <SelectItem value="so">ソマリ語（so）</SelectItem>
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>翻訳（Chrome Translator API）</CardTitle>
        <CardDescription>
          Translator API が利用可能なChrome環境でのみ動作するだす（目安: Chrome {MIN_CHROME_VERSION.translatorApi}+）。状態はマイク状態に表示されるだす。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>翻訳モード</Label>
          <Select
            value={translationMode}
            onValueChange={(value) => {
              const mode = value === 'chrome' ? 'chrome' : 'off';
              updateOverlaySettings({
                mic_transcript_translation_mode: mode,
                mic_transcript_translation_enabled: mode !== 'off',
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="翻訳モードを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">OFF</SelectItem>
              <SelectItem value="chrome">Chrome内蔵翻訳（Translator API）</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>翻訳先言語（1）</Label>
            <Select
              value={(overlaySettings?.mic_transcript_translation_language || '').trim() || 'en'}
              onValueChange={(value) => updateOverlaySettings({ mic_transcript_translation_language: value })}
              disabled={translationDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="言語を選択" />
              </SelectTrigger>
              <SelectContent>{translationLangOptions}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mic-translation-font">翻訳(1)文字サイズ</Label>
            <Input
              id="mic-translation-font"
              type="number"
              min="10"
              max="80"
              value={overlaySettings?.mic_transcript_translation_font_size ?? 16}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation_font_size: parseInt(e.target.value, 10) || 0 })}
              disabled={translationDisabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>翻訳先言語（2）</Label>
            <Select
              value={translation2Value}
              onValueChange={(value) => updateOverlaySettings({ mic_transcript_translation2_language: value === '__none__' ? '' : value })}
              disabled={translationDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="言語を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">なし</SelectItem>
                {translationLangOptions}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mic-translation2-font">翻訳(2)文字サイズ</Label>
            <Input
              id="mic-translation2-font"
              type="number"
              min="10"
              max="80"
              value={overlaySettings?.mic_transcript_translation2_font_size ?? 16}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation2_font_size: parseInt(e.target.value, 10) || 0 })}
              disabled={translationDisabled || translation2Value === '__none__'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>翻訳先言語（3）</Label>
            <Select
              value={translation3Value}
              onValueChange={(value) => updateOverlaySettings({ mic_transcript_translation3_language: value === '__none__' ? '' : value })}
              disabled={translationDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="言語を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">なし</SelectItem>
                {translationLangOptions}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mic-translation3-font">翻訳(3)文字サイズ</Label>
            <Input
              id="mic-translation3-font"
              type="number"
              min="10"
              max="80"
              value={overlaySettings?.mic_transcript_translation3_font_size ?? 16}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation3_font_size: parseInt(e.target.value, 10) || 0 })}
              disabled={translationDisabled || translation3Value === '__none__'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>翻訳表示位置</Label>
            <Select
              value={overlaySettings?.mic_transcript_translation_position || (overlaySettings?.mic_transcript_position || 'bottom-left')}
              onValueChange={(value) => updateOverlaySettings({ mic_transcript_translation_position: value })}
              disabled={translationDisabled}
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
          <div className="space-y-2">
            <Label htmlFor="mic-translation-max-width">翻訳 最大幅（px, 0で無効）</Label>
            <Input
              id="mic-translation-max-width"
              type="number"
              min="0"
              max="4096"
              value={overlaySettings?.mic_transcript_translation_max_width_px ?? 0}
              onChange={(e) => updateOverlaySettings({ mic_transcript_translation_max_width_px: parseInt(e.target.value, 10) || 0 })}
              disabled={translationDisabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
