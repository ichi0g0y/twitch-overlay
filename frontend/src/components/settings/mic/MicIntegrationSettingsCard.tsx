import React, { useContext } from 'react';
import { SettingsPageContext } from '../../../hooks/useSettingsPage';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';

export const MicIntegrationSettingsCard: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) throw new Error('MicIntegrationSettingsCard must be used within SettingsPageProvider');

  const { overlaySettings, updateOverlaySettings } = context;

  return (
    <Card>
      <CardHeader>
        <CardTitle>フィルタ/連携</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>不適切語フィルタ（anti_sexual）</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              bad/good word listで置換（ネットワーク取得）。送信/翻訳結果に適用するだす
            </p>
          </div>
          <Switch
            checked={overlaySettings?.mic_transcript_anti_sexual_enabled ?? false}
            onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_anti_sexual_enabled: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>棒読みちゃん連携（bouyomi）</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono">ws://localhost:50002/ws/</span> へ送信するだす
            </p>
          </div>
          <Switch
            checked={overlaySettings?.mic_transcript_bouyomi_enabled ?? false}
            onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_bouyomi_enabled: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
};
