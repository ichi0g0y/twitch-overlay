import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildApiUrl } from '../utils/api';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const DEFAULT_PORT = 8080;

const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const data = JSON.parse(text) as { detail?: string; error?: string; message?: string };
      const detail = data.detail || data.error || data.message;
      if (detail) {
        return `HTTP ${response.status}: ${detail}`;
      }
    } catch {
      // ignore json parse errors
    }
    return `HTTP ${response.status}: ${text}`;
  } catch {
    return fallback;
  }
};

const parsePort = (value: string): number | null => {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < MIN_PORT || parsed > MAX_PORT) {
    return null;
  }
  return parsed;
};

const extractCurrentPort = (payload: any): number => {
  const fromStatus = Number(payload?.status?.webserver_port);
  if (Number.isInteger(fromStatus) && fromStatus > 0) {
    return fromStatus;
  }

  const rawSetting = payload?.settings?.SERVER_PORT;
  const fromSetting =
    typeof rawSetting === 'string'
      ? Number.parseInt(rawSetting, 10)
      : Number.parseInt(String(rawSetting?.value ?? ''), 10);
  if (Number.isInteger(fromSetting) && fromSetting > 0) {
    return fromSetting;
  }

  return DEFAULT_PORT;
};

export function TraySettingsWindow() {
  const [currentPort, setCurrentPort] = useState<number>(DEFAULT_PORT);
  const [inputPort, setInputPort] = useState<string>(String(DEFAULT_PORT));
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [webServerError, setWebServerError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/settings/v2'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const nextPort = extractCurrentPort(payload);
      setCurrentPort(nextPort);
      setInputPort(String(nextPort));
      setWebServerError(null);
    } catch (error: any) {
      toast.error(`設定取得に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveAndRestart = async () => {
    const nextPort = parsePort(inputPort);
    if (nextPort === null) {
      toast.error(`ポート番号は ${MIN_PORT}-${MAX_PORT} の整数で入力してください`);
      return;
    }

    setSubmitting(true);
    try {
      if (nextPort !== currentPort) {
        const response = await fetch(buildApiUrl('/api/settings/v2'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ SERVER_PORT: String(nextPort) }),
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
      }

      const restartedPort = await invoke<number>('restart_server');
      const effectivePort = Number.isInteger(restartedPort) && restartedPort > 0 ? restartedPort : nextPort;
      setCurrentPort(effectivePort);
      setInputPort(String(effectivePort));
      setWebServerError(null);
      toast.success(`サーバーを再起動しました (port: ${effectivePort})`);
    } catch (error: any) {
      setWebServerError(error.message);
      toast.error(`再起動に失敗しました: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuitApp = async () => {
    try {
      await invoke('quit_app');
    } catch (error: any) {
      toast.error(`アプリ終了に失敗しました: ${error.message}`);
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-900 text-gray-100 p-4 overflow-auto"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>WebUI向けポート設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="server_port">Webサーバーポート</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="server_port"
                type="number"
                min={MIN_PORT}
                max={MAX_PORT}
                value={inputPort}
                onChange={(event) => setInputPort(event.target.value)}
                disabled={submitting}
                className="w-40 font-mono"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                WebUI用のWebサーバーポート
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              現在稼働中ポート: {loading ? '読み込み中...' : currentPort} / 設定範囲: {MIN_PORT}-{MAX_PORT}
            </p>
            {webServerError && (
              <Alert className="mt-2">
                <AlertDescription className="text-red-600">
                  ポート {inputPort} の起動に失敗しました: {webServerError}
                </AlertDescription>
              </Alert>
            )}
            {inputPort !== String(currentPort) && (
              <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                ⚠️ ポート変更を反映するには「保存して再起動」を実行してください
              </p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleSaveAndRestart}
            disabled={loading || submitting}
          >
            {submitting ? '保存して再起動中...' : '保存して再起動'}
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            onClick={handleQuitApp}
            disabled={submitting}
          >
            Appを終了
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
