import React, { useContext } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { WordFilterManager } from './WordFilterManager';

export const MicSpeechSettingsCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicSpeechSettingsCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;

  return (
    <Card>
      <CardHeader>
        <CardTitle>音声認識（Web Speech）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mic-speech-lang">認識言語（例: ja / en / ko）</Label>
            <Input
              id="mic-speech-lang"
              placeholder="ja / en / ko ..."
              value={overlaySettings?.mic_transcript_speech_language ?? 'ja'}
              onChange={(e) => updateOverlaySettings({ mic_transcript_speech_language: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mic-short-pause">ショートポーズ停止（ms, 0で無効）</Label>
            <Input
              id="mic-short-pause"
              type="number"
              min="0"
              max="5000"
              value={overlaySettings?.mic_transcript_speech_short_pause_ms ?? 750}
              onChange={(e) => updateOverlaySettings({ mic_transcript_speech_short_pause_ms: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mic-interim-throttle">interim送信間隔（ms, 0で無効）</Label>
            <Input
              id="mic-interim-throttle"
              type="number"
              min="0"
              max="2000"
              value={overlaySettings?.mic_transcript_speech_interim_throttle_ms ?? 200}
              onChange={(e) => updateOverlaySettings({ mic_transcript_speech_interim_throttle_ms: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mic-restart-delay">再起動遅延（ms）</Label>
            <Input
              id="mic-restart-delay"
              type="number"
              min="0"
              max="2000"
              value={overlaySettings?.mic_transcript_speech_restart_delay_ms ?? 100}
              onChange={(e) => updateOverlaySettings({ mic_transcript_speech_restart_delay_ms: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-4 pt-7">
            <div className="space-y-0.5">
              <Label>デュアルインスタンス</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">途切れを減らす</p>
            </div>
            <Switch
              checked={overlaySettings?.mic_transcript_speech_dual_instance_enabled ?? true}
              onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_speech_dual_instance_enabled: checked })}
            />
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-gray-800/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>不適切語フィルタ</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">bad/good word listで置換するだす</p>
              </div>
              <Switch
                checked={overlaySettings?.mic_transcript_anti_sexual_enabled ?? false}
                onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_anti_sexual_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>棒読みちゃん連携</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">ws://localhost:50002/ws/ へ送信</p>
              </div>
              <Switch
                checked={overlaySettings?.mic_transcript_bouyomi_enabled ?? false}
                onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_bouyomi_enabled: checked })}
              />
            </div>
          </div>

          {(overlaySettings?.mic_transcript_anti_sexual_enabled ?? false) && (
            <WordFilterManager />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
