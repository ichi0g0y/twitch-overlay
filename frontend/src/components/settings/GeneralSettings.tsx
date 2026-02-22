import { StreamStatus } from '@/types';
import { Bell, RefreshCw, Upload, X } from 'lucide-react';
import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { CollapsibleCard } from '../ui/collapsible-card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

interface GeneralSettingsProps {
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean) => void;
  getBooleanValue: (key: string) => boolean;
  streamStatus: StreamStatus | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploadingFont: boolean;
  handleFontUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  previewText: string;
  setPreviewText: (text: string) => void;
  previewImage: string | null;
  handleFontPreview: () => void;
  handleDeleteFont: () => void;
  handleTestNotification: () => void;
  testingNotification: boolean;
  sections?: Array<'basic' | 'notification' | 'font'>;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  streamStatus,
  fileInputRef,
  uploadingFont,
  handleFontUpload,
  previewText,
  setPreviewText,
  previewImage,
  handleFontPreview,
  handleDeleteFont,
  handleTestNotification,
  testingNotification,
  sections,
}) => {
  const visibleSections = new Set(sections ?? ['basic', 'notification', 'font']);

  return (
    <div className="space-y-6 focus:outline-none">
      {visibleSections.has('basic') && (
        <CollapsibleCard
          panelId="settings.general.basic"
          title="基本設定"
          description="アプリケーションの基本的な動作を設定します"
          contentClassName="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="timezone">タイムゾーン</Label>
            <Select
              value={getSettingValue('TIMEZONE')}
              onValueChange={(value) => handleSettingChange('TIMEZONE', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="タイムゾーンを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>ドライランモード</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  実際の印刷を行わずテストします
                </p>
              </div>
              <Switch
                checked={getBooleanValue('DRY_RUN_MODE')}
                onCheckedChange={(checked) => handleSettingChange('DRY_RUN_MODE', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>オフライン時自動ドライラン</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  配信オフライン時に自動でドライランモードに切り替えます
                </p>
                {getBooleanValue('AUTO_DRY_RUN_WHEN_OFFLINE') && !getBooleanValue('DRY_RUN_MODE') && (
                  <div className="mt-1">
                    {streamStatus?.is_live ? (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ✓ 配信中 - ドライラン無効
                      </span>
                    ) : streamStatus === null ? (
                      <span className="text-xs text-yellow-600 dark:text-yellow-400">
                        ⚠ 配信状態不明
                      </span>
                    ) : (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        ⚠ オフライン - ドライラン有効
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Switch
                checked={getBooleanValue('AUTO_DRY_RUN_WHEN_OFFLINE')}
                onCheckedChange={(checked) => handleSettingChange('AUTO_DRY_RUN_WHEN_OFFLINE', checked)}
                disabled={getBooleanValue('DRY_RUN_MODE')}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>デバッグ出力</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                詳細なログを出力します
              </p>
            </div>
            <Switch
              checked={getBooleanValue('DEBUG_OUTPUT')}
              onCheckedChange={(checked) => handleSettingChange('DEBUG_OUTPUT', checked)}
            />
          </div>
        </CollapsibleCard>
      )}

      {/* 通知設定カード */}
      {visibleSections.has('notification') && (
        <CollapsibleCard
          panelId="settings.general.notification"
          title="通知設定"
          description="Twitchチャット受信時の通知ウィンドウ表示を設定します"
          contentClassName="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>チャット通知を有効化</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Twitchチャットを受信したときに通知ウィンドウを表示します
              </p>
            </div>
            <Switch
              checked={getBooleanValue('NOTIFICATION_ENABLED')}
              onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_ENABLED', checked)}
            />
          </div>

          {getBooleanValue('NOTIFICATION_ENABLED') && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-mode">表示モード</Label>
                  <Select
                    value={getSettingValue('NOTIFICATION_DISPLAY_MODE') || 'queue'}
                    onValueChange={(value) => handleSettingChange('NOTIFICATION_DISPLAY_MODE', value)}
                  >
                    <SelectTrigger id="notification-mode">
                      <SelectValue placeholder="表示モードを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="queue">キュー表示（順番に表示）</SelectItem>
                      <SelectItem value="overwrite">上書き表示（最新のみ）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notification-duration">表示時間（秒）</Label>
                  <Input
                    id="notification-duration"
                    type="number"
                    min={1}
                    max={60}
                    value={getSettingValue('NOTIFICATION_DISPLAY_DURATION') || '5'}
                    onChange={(e) => handleSettingChange('NOTIFICATION_DISPLAY_DURATION', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notification-font-size">通知文字サイズ</Label>
                  <Input
                    id="notification-font-size"
                    type="number"
                    min={10}
                    max={48}
                    value={getSettingValue('NOTIFICATION_FONT_SIZE') || '14'}
                    onChange={(e) => handleSettingChange('NOTIFICATION_FONT_SIZE', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>通知ウィンドウを移動可能にする</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      通知上部のドラッグバーで移動できます
                    </p>
                  </div>
                  <Switch
                    checked={getBooleanValue('NOTIFICATION_WINDOW_MOVABLE')}
                    onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_WINDOW_MOVABLE', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>通知ウィンドウをサイズ変更可能にする</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      右下ハンドルをドラッグしてサイズ変更できます
                    </p>
                  </div>
                  <Switch
                    checked={getBooleanValue('NOTIFICATION_WINDOW_RESIZABLE')}
                    onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_WINDOW_RESIZABLE', checked)}
                    disabled={!getBooleanValue('NOTIFICATION_WINDOW_MOVABLE')}
                  />
                </div>
              </div>

              <Alert>
                <Bell className="h-4 w-4" />
                <AlertDescription>
                  通知が有効です。Twitchチャットを受信すると通知ウィンドウに表示されます。
                </AlertDescription>
              </Alert>

              <div>
                <Button
                  onClick={handleTestNotification}
                  variant="outline"
                  className="w-full"
                  disabled={testingNotification}
                >
                  {testingNotification ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      テスト送信中...
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4 mr-2" />
                      テスト通知を送信
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  通知ウィンドウにテスト通知を表示します。
                </p>
              </div>
            </div>
          )}
        </CollapsibleCard>
      )}

      {/* フォント設定カード */}
      {visibleSections.has('font') && (
        <CollapsibleCard
          panelId="settings.general.font"
          title="フォント設定（必須）"
          description="FAXと時計機能を使用するためにフォントのアップロードが必要です"
          contentClassName="space-y-6"
        >
          {!getSettingValue('FONT_FILENAME') && (
            <Alert className="dark:bg-yellow-900/20 dark:border-yellow-700">
              <AlertDescription className="text-yellow-700 dark:text-yellow-200">
                ⚠️ フォントがアップロードされていません。FAXと時計機能を使用するには、フォントファイル（.ttf/.otf）をアップロードしてください。
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>フォントファイルをアップロード</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ttf,.otf"
                  onChange={handleFontUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFont}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {uploadingFont ? 'アップロード中...' : 'フォントをアップロード'}
                </Button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  .ttf または .otf ファイル
                </span>
              </div>
            </div>

            {getSettingValue('FONT_FILENAME') && (
              <>
                <div className="space-y-2">
                  <Label>現在のフォント</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={getSettingValue('FONT_FILENAME')}
                      disabled
                      className="max-w-xs"
                    />
                    <Button
                      onClick={handleDeleteFont}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                      削除
                    </Button>
                  </div>
                </div>

                {/* フォントプレビュー */}
                <div className="space-y-2">
                  <Label>フォントプレビュー</Label>
                  <div className="space-y-2">
                    <textarea
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md min-h-[80px] font-mono text-sm"
                      placeholder="プレビューテキストを入力..."
                    />
                    <Button
                      onClick={handleFontPreview}
                      variant="outline"
                      disabled={!getSettingValue('FONT_FILENAME')}
                    >
                      プレビューを生成
                    </Button>
                  </div>
                  {previewImage && (
                    <div className="mt-2 p-4 bg-gray-100 dark:bg-gray-700 rounded">
                      <img
                        src={previewImage}
                        alt="Font Preview"
                        className="max-w-full h-auto border border-gray-300 dark:border-gray-600"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
};
