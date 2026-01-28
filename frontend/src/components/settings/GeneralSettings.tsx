import { StreamStatus } from '@/types';
import { Bell, Eye, EyeOff, RefreshCw, Upload, X } from 'lucide-react';
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
  showSecrets: Record<string, boolean>;
  setShowSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
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
  showSecrets,
  setShowSecrets,
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
  const openAiModels = [
    {
      id: 'gpt-5',
      name: 'GPT-5',
      price: '入力 $1.25 / 出力 $10.00',
    },
    {
      id: 'gpt-5-mini',
      name: 'GPT-5 mini',
      price: '入力 $0.25 / 出力 $2.00',
    },
    {
      id: 'gpt-5-nano',
      name: 'GPT-5 nano',
      price: '入力 $0.05 / 出力 $0.40',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      price: '入力 $0.15 / 出力 $0.60',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      price: '入力 $2.50 / 出力 $10.00',
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 mini',
      price: '入力 $0.40 / 出力 $1.60',
    },
  ];
  const selectedOpenAiModel = getSettingValue('OPENAI_MODEL') || 'gpt-4o-mini';
  const inputTokens = parseInt(getSettingValue('OPENAI_USAGE_INPUT_TOKENS') || '0', 10) || 0;
  const outputTokens = parseInt(getSettingValue('OPENAI_USAGE_OUTPUT_TOKENS') || '0', 10) || 0;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = parseFloat(getSettingValue('OPENAI_USAGE_COST_USD') || '0') || 0;
  const formatNumber = (value: number) => value.toLocaleString('ja-JP');
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

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

          <div className="space-y-2">
            <Label htmlFor="openai_api_key">OpenAI APIキー</Label>
            <div className="flex items-center gap-2">
              <Input
                id="openai_api_key"
                type={showSecrets['OPENAI_API_KEY'] ? 'text' : 'password'}
                placeholder={getSettingValue('OPENAI_API_KEY') ? '（設定済み）' : 'OpenAI API Key'}
                value={getSettingValue('OPENAI_API_KEY')}
                onChange={(e) => handleSettingChange('OPENAI_API_KEY', e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowSecrets(prev => ({ ...prev, OPENAI_API_KEY: !prev.OPENAI_API_KEY }))}
                aria-label="OpenAI APIキーの表示切り替え"
              >
                {showSecrets['OPENAI_API_KEY'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {openAiModels.map((model) => {
                  const isActive = selectedOpenAiModel === model.id;
                  return (
                    <Button
                      key={model.id}
                      type="button"
                      variant={isActive ? 'default' : 'outline'}
                      onClick={() => handleSettingChange('OPENAI_MODEL', model.id)}
                      className="h-auto px-3 py-2"
                    >
                      <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-semibold">{model.name}</span>
                        <span className={`text-xs ${isActive ? 'opacity-80' : 'text-gray-500 dark:text-gray-400'}`}>
                          {model.price}
                        </span>
                      </div>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                価格はStandardの1Mトークンあたり（入力 / 出力）
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">OpenAI 使用量（概算）</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">入力トークン</div>
                  <div className="mt-1 font-semibold">{formatNumber(inputTokens)}</div>
                </div>
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">出力トークン</div>
                  <div className="mt-1 font-semibold">{formatNumber(outputTokens)}</div>
                </div>
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">合計トークン</div>
                  <div className="mt-1 font-semibold">{formatNumber(totalTokens)}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                推定料金: <span className="font-semibold">{formatUsd(costUsd)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                OpenAIの公式価格に基づく概算（未対応モデルは除外・モデル変更時は誤差が出る可能性あり）
              </p>
            </div>
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

              <div className="space-y-2">
                <Label htmlFor="notification_display_duration">通知表示時間（秒）</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="notification_display_duration"
                    type="number"
                    min="1"
                    max="60"
                    value={getSettingValue('NOTIFICATION_DISPLAY_DURATION')}
                    onChange={(e) => handleSettingChange('NOTIFICATION_DISPLAY_DURATION', e.target.value)}
                    className="w-24"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    通知を表示する秒数（1〜60秒）
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  複数の通知がある場合は、キューに入れて順番に表示されます
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notification_font_size">文字サイズ</Label>
                <div className="flex items-center space-x-2">
                  <Select
                    value={getSettingValue('NOTIFICATION_FONT_SIZE') || '14'}
                    onValueChange={(value) => handleSettingChange('NOTIFICATION_FONT_SIZE', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="サイズを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10px（小）</SelectItem>
                      <SelectItem value="12">12px</SelectItem>
                      <SelectItem value="14">14px（標準）</SelectItem>
                      <SelectItem value="16">16px</SelectItem>
                      <SelectItem value="18">18px（大）</SelectItem>
                      <SelectItem value="20">20px</SelectItem>
                      <SelectItem value="22">22px</SelectItem>
                      <SelectItem value="24">24px（特大）</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    通知ウインドウの文字サイズ（エモートも連動）
                  </p>
                </div>
              </div>

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
