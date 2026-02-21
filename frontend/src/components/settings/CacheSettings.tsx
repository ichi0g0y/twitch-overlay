import { AlertCircle, HardDrive, Trash2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { buildApiUrl } from '../../utils/api';

interface CacheSettings {
  expiry_days: number;
  max_size_mb: number;
  cleanup_enabled: boolean;
  cleanup_on_start: boolean;
}

interface CacheStats {
  total_files: number;
  total_size_bytes: number;
  oldest_file_date: string | null;
}

export const CacheSettings: React.FC = () => {
  const [settings, setSettings] = useState<CacheSettings>({
    expiry_days: 7,
    max_size_mb: 100,
    cleanup_enabled: true,
    cleanup_on_start: true,
  });
  const [stats, setStats] = useState<CacheStats>({
    total_files: 0,
    total_size_bytes: 0,
    oldest_file_date: null,
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadStats();

    // 30秒ごとに統計情報を更新
    const interval = setInterval(() => {
      loadStats();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/cache/settings'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setSettings(result as CacheSettings);
      setError(null);
    } catch (err) {
      setError(`設定の読み込みに失敗しました: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/cache/stats'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setStats(result as CacheStats);
    } catch (err) {
      console.error('統計情報の読み込みに失敗:', err);
    }
  };

  const handleSettingChange = (key: keyof CacheSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    setUpdating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(buildApiUrl('/api/cache/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSuccess('設定を保存しました');
      await loadStats(); // 設定変更後に統計情報を更新
    } catch (err) {
      setError(`設定の保存に失敗しました: ${err}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('すべてのキャッシュファイルを削除しますか？')) return;

    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(buildApiUrl('/api/cache/clear'), { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSuccess('キャッシュをクリアしました');
      await loadStats();
    } catch (err) {
      setError(`キャッシュのクリアに失敗しました: ${err}`);
    } finally {
      setClearing(false);
    }
  };

  const handleCleanupExpired = async () => {
    setCleaning(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(buildApiUrl('/api/cache/cleanup'), { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSuccess('期限切れキャッシュを削除しました');
      await loadStats();
    } catch (err) {
      setError(`期限切れキャッシュの削除に失敗しました: ${err}`);
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription className="text-green-700 dark:text-green-300">{success}</AlertDescription>
        </Alert>
      )}

      {/* キャッシュ統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HardDrive className="w-5 h-5" />
            <span>キャッシュ統計</span>
          </CardTitle>
          <CardDescription>
            現在のキャッシュ使用状況
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.total_files}
              </div>
              <div className="text-sm text-gray-500">ファイル数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {(stats.total_size_bytes / 1024 / 1024).toFixed(1)} MB
              </div>
              <div className="text-sm text-gray-500">使用容量</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600 dark:text-gray-400">
                {stats.oldest_file_date ? new Date(stats.oldest_file_date).toLocaleDateString() : '-'}
              </div>
              <div className="text-sm text-gray-500">最古ファイル</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* キャッシュ設定 */}
      <Card>
        <CardHeader>
          <CardTitle>キャッシュ設定</CardTitle>
          <CardDescription>
            ダウンロードした画像のキャッシュ管理設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 有効期限設定 */}
            <div className="space-y-2">
              <Label htmlFor="expiry-days">有効期限（日数）</Label>
              <Input
                id="expiry-days"
                type="number"
                min="1"
                max="365"
                value={settings.expiry_days}
                onChange={(e) => handleSettingChange('expiry_days', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-500">
                この日数を過ぎたキャッシュファイルが削除対象になります
              </p>
            </div>

            {/* 最大サイズ設定 */}
            <div className="space-y-2">
              <Label htmlFor="max-size">最大キャッシュサイズ（MB）</Label>
              <Input
                id="max-size"
                type="number"
                min="10"
                max="10000"
                value={settings.max_size_mb}
                onChange={(e) => handleSettingChange('max_size_mb', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-500">
                この容量を超えると古いファイルから削除されます
              </p>
            </div>
          </div>

          {/* スイッチ設定 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cleanup-enabled">自動クリーンアップ</Label>
                <p className="text-sm text-gray-500">
                  期限切れファイルの自動削除を有効にします
                </p>
              </div>
              <Switch
                id="cleanup-enabled"
                checked={settings.cleanup_enabled}
                onCheckedChange={(checked) => handleSettingChange('cleanup_enabled', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cleanup-on-start">起動時クリーンアップ</Label>
                <p className="text-sm text-gray-500">
                  アプリ起動時に自動クリーンアップを実行します
                </p>
              </div>
              <Switch
                id="cleanup-on-start"
                checked={settings.cleanup_on_start}
                onCheckedChange={(checked) => handleSettingChange('cleanup_on_start', checked)}
              />
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="pt-4">
            <Button
              onClick={handleSaveSettings}
              disabled={updating}
              className="w-full md:w-auto"
            >
              {updating ? '保存中...' : '設定を保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* キャッシュ管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trash2 className="w-5 h-5" />
            <span>キャッシュ管理</span>
          </CardTitle>
          <CardDescription>
            キャッシュファイルの手動削除操作
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Button
              variant="outline"
              onClick={handleCleanupExpired}
              disabled={cleaning}
              className="flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>{cleaning ? '削除中...' : '期限切れファイルを削除'}</span>
            </Button>

            <Button
              variant="destructive"
              onClick={handleClearCache}
              disabled={clearing}
              className="flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>{clearing ? 'クリア中...' : 'すべてのキャッシュをクリア'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
