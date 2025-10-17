import { StreamStatus } from '@/types';
import { Bell, RefreshCw, Upload, X } from 'lucide-react';
import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

interface GeneralSettingsProps {
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean) => void;
  getBooleanValue: (key: string) => boolean;
  webServerError: { error: string; port: number } | null;
  webServerPort: number;
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
  resettingNotificationPosition: boolean;
  handleResetNotificationPosition: () => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  webServerError,
  webServerPort,
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
  resettingNotificationPosition,
  handleResetNotificationPosition,
}) => {
  return (
    <div className="space-y-6 focus:outline-none">
      <Card>
        <CardHeader>
          <CardTitle>基本設定</CardTitle>
          <CardDescription>
            アプリケーションの基本的な動作を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <div className="space-y-2">
            <Label htmlFor="server_port">Webサーバーポート</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="server_port"
                type="number"
                min="1024"
                max="65535"
                value={getSettingValue('SERVER_PORT')}
                onChange={(e) => handleSettingChange('SERVER_PORT', e.target.value)}
                className="w-32"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                OBSオーバーレイ用のWebサーバーポート（変更後はアプリ再起動が必要）
              </p>
            </div>
            {webServerError && (
              <Alert className="mt-2">
                <AlertDescription className="text-red-600">
                  ポート {webServerError.port} の起動に失敗しました: {webServerError.error}
                </AlertDescription>
              </Alert>
            )}
            {getSettingValue('SERVER_PORT') !== String(webServerPort) && (
              <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                ⚠️ ポート変更を反映するにはアプリを再起動してください
              </p>
            )}
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
        </CardContent>
      </Card>

      {/* 通知設定カード */}
      <Card>
        <CardHeader>
          <CardTitle>通知設定</CardTitle>
          <CardDescription>
            Twitchチャット受信時の通知ウインドウを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>チャット通知を有効化</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Twitchチャットを受信したときに通知ウインドウを表示します
              </p>
            </div>
            <Switch
              checked={getBooleanValue('NOTIFICATION_ENABLED')}
              onCheckedChange={(checked) => handleSettingChange('NOTIFICATION_ENABLED', checked)}
            />
          </div>

          {getBooleanValue('NOTIFICATION_ENABLED') && (
            <div className="space-y-4">
              <Alert>
                <Bell className="h-4 w-4" />
                <AlertDescription>
                  通知が有効です。Twitchチャットを受信すると、ドラッグ可能な通知ウインドウが表示されます。ドラッグして移動した位置が自動的に記憶されます。
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
                  テスト通知ウインドウが表示されます。ドラッグして位置を変更できます。
                </p>
              </div>

              <div>
                <Button
                  onClick={handleResetNotificationPosition}
                  variant="outline"
                  className="w-full"
                  disabled={resettingNotificationPosition}
                >
                  {resettingNotificationPosition ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      リセット中...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      通知ウィンドウの位置をリセット
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  保存された通知ウィンドウの位置をクリアし、次回表示時にデフォルト位置で表示します
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* フォント設定カード */}
      <Card>
        <CardHeader>
          <CardTitle>フォント設定（必須）</CardTitle>
          <CardDescription>
            FAXと時計機能を使用するためにフォントのアップロードが必要です
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
        </CardContent>
      </Card>
    </div>
  );
};