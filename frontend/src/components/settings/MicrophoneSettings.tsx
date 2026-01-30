import React, { useContext, useEffect } from 'react';
import { Mic, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { SettingsPageContext } from '../../hooks/useSettingsPage';

const MODEL_OPTIONS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large',
  'large-v2',
  'large-v3',
];

const BACKEND_OPTIONS = [
  { value: 'whisper', label: 'Whisper（openai-whisper）' },
  { value: 'whispercpp', label: 'whisper.cpp（GGUF）' },
];

const DEVICE_OPTIONS = [
  { value: 'auto', label: '自動 (MPS/CUDA/CPU)' },
  { value: 'mps', label: 'MPS (Apple GPU)' },
  { value: 'cpu', label: 'CPU' },
  { value: 'cuda', label: 'CUDA' },
];

export const MicrophoneSettings: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('MicrophoneSettings must be used within SettingsPageProvider');
  }

  const {
    getSettingValue,
    getBooleanValue,
    handleSettingChange,
    micDevices,
    loadingMicDevices,
    handleRefreshMicDevices,
    restartingMicRecog,
    handleRestartMicRecog,
  } = context;

  const backendValue = getSettingValue('MIC_RECOG_BACKEND') || 'whisper';
  const deviceValue = getSettingValue('MIC_RECOG_DEVICE') || 'auto';
  const modelValue = getSettingValue('MIC_RECOG_MODEL') || 'large-v3';
  const whispercppBinValue = getSettingValue('MIC_RECOG_WHISPERCPP_BIN') || '';
  const whispercppModelValue = getSettingValue('MIC_RECOG_WHISPERCPP_MODEL') || '';
  const whispercppThreadsValue = getSettingValue('MIC_RECOG_WHISPERCPP_THREADS') || '';
  const whispercppExtraArgsValue = getSettingValue('MIC_RECOG_WHISPERCPP_EXTRA_ARGS') || '';
  const languageValue = getSettingValue('MIC_RECOG_LANGUAGE') || '';
  const excludeValue = getSettingValue('MIC_RECOG_EXCLUDE') || '';
  const micIndexValue = getSettingValue('MIC_RECOG_MIC_INDEX') || '';
  const selectedMicIndex = micIndexValue === '' ? 'default' : micIndexValue;
  const interimEnabled = getBooleanValue('MIC_RECOG_INTERIM');
  const interimSeconds = getSettingValue('MIC_RECOG_INTERIM_SECONDS') || '0.5';
  const interimWindowSeconds = getSettingValue('MIC_RECOG_INTERIM_WINDOW_SECONDS') || '3';
  const interimMinSeconds = getSettingValue('MIC_RECOG_INTERIM_MIN_SECONDS') || '1';
  const isWhisper = backendValue !== 'whispercpp';

  useEffect(() => {
    handleRefreshMicDevices();
  }, [handleRefreshMicDevices]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="w-4 h-4" />
            音声認識（mic-recog）
          </CardTitle>
          <CardDescription>
            マイク入力のWhisper設定を変更します（反映にはアプリ再起動が必要）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>音声認識を有効化</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                mic-recogの自動起動を有効にします
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRestartMicRecog}
                disabled={restartingMicRecog}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${restartingMicRecog ? 'animate-spin' : ''}`} />
                再起動
              </Button>
              <Switch
                checked={getBooleanValue('MIC_RECOG_ENABLED')}
                onCheckedChange={(checked) => handleSettingChange('MIC_RECOG_ENABLED', checked)}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            設定変更後に再起動すると即反映されます
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>エンジン</Label>
              <Select
                value={backendValue}
                onValueChange={(value) => handleSettingChange('MIC_RECOG_BACKEND', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="エンジンを選択" />
                </SelectTrigger>
                <SelectContent>
                  {BACKEND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>エンジン切替時の注意</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isWhisper
                  ? 'Whisper設定とwhisper.cpp設定は別に保持されます'
                  : 'whisper.cppはinterim非対応です（設定は保持されます）'}
              </p>
            </div>
          </div>

          {isWhisper ? (
            <>
              <div className="space-y-2">
                <Label>実行デバイス</Label>
                <Select
                  value={deviceValue}
                  onValueChange={(value) => handleSettingChange('MIC_RECOG_DEVICE', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="デバイスを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  MPSはApple SiliconのGPUを使用します
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>モデル</Label>
                  <Select
                    value={modelValue}
                    onValueChange={(value) => handleSettingChange('MIC_RECOG_MODEL', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="モデルを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mic-language">言語コード</Label>
                  <Input
                    id="mic-language"
                    placeholder="ja / en / 空欄で自動"
                    value={languageValue}
                    onChange={(e) => handleSettingChange('MIC_RECOG_LANGUAGE', e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="whispercpp-bin">whisper.cpp バイナリ</Label>
                  <Input
                    id="whispercpp-bin"
                    placeholder="/path/to/whisper.cpp/main"
                    value={whispercppBinValue}
                    onChange={(e) => handleSettingChange('MIC_RECOG_WHISPERCPP_BIN', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whispercpp-model">モデル（GGUF）</Label>
                  <Input
                    id="whispercpp-model"
                    placeholder="/path/to/model.gguf"
                    value={whispercppModelValue}
                    onChange={(e) => handleSettingChange('MIC_RECOG_WHISPERCPP_MODEL', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="whispercpp-threads">スレッド数</Label>
                  <Input
                    id="whispercpp-threads"
                    type="number"
                    min="1"
                    placeholder="空欄で自動"
                    value={whispercppThreadsValue}
                    onChange={(e) => handleSettingChange('MIC_RECOG_WHISPERCPP_THREADS', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mic-language-cpp">言語コード</Label>
                  <Input
                    id="mic-language-cpp"
                    placeholder="ja / en / 空欄で自動"
                    value={languageValue}
                    onChange={(e) => handleSettingChange('MIC_RECOG_LANGUAGE', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whispercpp-extra-args">追加引数</Label>
                <Input
                  id="whispercpp-extra-args"
                  placeholder="-ng -nt"
                  value={whispercppExtraArgsValue}
                  onChange={(e) => handleSettingChange('MIC_RECOG_WHISPERCPP_EXTRA_ARGS', e.target.value)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  空白区切りで指定します（必要な場合のみ）
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>マイクデバイス</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshMicDevices}
                disabled={loadingMicDevices}
              >
                {loadingMicDevices ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    取得中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    更新
                  </>
                )}
              </Button>
            </div>
            <Select
              value={selectedMicIndex}
              onValueChange={(value) =>
                handleSettingChange('MIC_RECOG_MIC_INDEX', value === 'default' ? '' : value)}
              disabled={loadingMicDevices}
            >
              <SelectTrigger>
                <SelectValue placeholder="マイクを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">デフォルトの入力デバイス</SelectItem>
                {micDevices.map((device) => (
                  <SelectItem key={device.index} value={String(device.index)}>
                    {device.name} (#{device.index}
                    {device.max_input_channels ? ` / ${device.max_input_channels}ch` : ''})
                    {device.is_default ? ' *' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {micDevices.length === 0 && !loadingMicDevices && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                マイクデバイスが見つかりませんでした
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VADとフィルタ</CardTitle>
          <CardDescription>
            音声区切りや無音フィルタの設定です
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>VADを有効化</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                自然な区切りで認識します
              </p>
            </div>
            <Switch
              checked={getBooleanValue('MIC_RECOG_VAD')}
              onCheckedChange={(checked) => handleSettingChange('MIC_RECOG_VAD', checked)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="vad-threshold">VADしきい値</Label>
              <Input
                id="vad-threshold"
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={getSettingValue('MIC_RECOG_VAD_THRESHOLD')}
                onChange={(e) => handleSettingChange('MIC_RECOG_VAD_THRESHOLD', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vad-end-ms">無音判定（ms）</Label>
              <Input
                id="vad-end-ms"
                type="number"
                step="50"
                min="100"
                value={getSettingValue('MIC_RECOG_VAD_END_MS')}
                onChange={(e) => handleSettingChange('MIC_RECOG_VAD_END_MS', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vad-pre-roll-ms">先読み（ms）</Label>
              <Input
                id="vad-pre-roll-ms"
                type="number"
                step="10"
                min="0"
                value={getSettingValue('MIC_RECOG_VAD_PRE_ROLL_MS')}
                onChange={(e) => handleSettingChange('MIC_RECOG_VAD_PRE_ROLL_MS', e.target.value)}
              />
            </div>

            {isWhisper && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="no-speech-threshold">無音しきい値</Label>
                  <Input
                    id="no-speech-threshold"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={getSettingValue('MIC_RECOG_NO_SPEECH_THRESHOLD')}
                    onChange={(e) => handleSettingChange('MIC_RECOG_NO_SPEECH_THRESHOLD', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logprob-threshold">logprobしきい値</Label>
                  <Input
                    id="logprob-threshold"
                    type="number"
                    step="0.1"
                    value={getSettingValue('MIC_RECOG_LOGPROB_THRESHOLD')}
                    onChange={(e) => handleSettingChange('MIC_RECOG_LOGPROB_THRESHOLD', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="exclude-phrases">除外フレーズ</Label>
            <Textarea
              id="exclude-phrases"
              placeholder="カンマまたは改行で区切って入力"
              value={excludeValue}
              onChange={(e) => handleSettingChange('MIC_RECOG_EXCLUDE', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {isWhisper && (
        <Card>
          <CardHeader>
            <CardTitle>リアルタイム表示（interim）</CardTitle>
            <CardDescription>
              Chrome風のリアルタイム認識表示を有効にします（負荷が増えます）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>リアルタイム更新を有効化</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  interim結果をWSで送信し、オーバーレイに即時反映します
                </p>
              </div>
              <Switch
                checked={interimEnabled}
                onCheckedChange={(checked) => handleSettingChange('MIC_RECOG_INTERIM', checked)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="interim-seconds">更新間隔（秒）</Label>
                <Input
                  id="interim-seconds"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={interimSeconds}
                  onChange={(e) => handleSettingChange('MIC_RECOG_INTERIM_SECONDS', e.target.value)}
                  disabled={!interimEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interim-window-seconds">ウィンドウ長（秒）</Label>
                <Input
                  id="interim-window-seconds"
                  type="number"
                  step="0.5"
                  min="1"
                  value={interimWindowSeconds}
                  onChange={(e) => handleSettingChange('MIC_RECOG_INTERIM_WINDOW_SECONDS', e.target.value)}
                  disabled={!interimEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interim-min-seconds">最小長（秒）</Label>
                <Input
                  id="interim-min-seconds"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={interimMinSeconds}
                  onChange={(e) => handleSettingChange('MIC_RECOG_INTERIM_MIN_SECONDS', e.target.value)}
                  disabled={!interimEnabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
