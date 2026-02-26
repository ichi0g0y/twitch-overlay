import { AlertCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '../ui/alert';
import { CacheActionsCard } from './cache/CacheActionsCard';
import { CacheConfigCard } from './cache/CacheConfigCard';
import { CacheStatsCard } from './cache/CacheStatsCard';
import type { CacheSettingsModel, CacheStatsModel } from './cache/types';
import { buildApiUrl } from '../../utils/api';

interface CacheSettingsProps {
  sections?: Array<'stats' | 'config' | 'actions'>;
}

export const CacheSettings: React.FC<CacheSettingsProps> = ({ sections }) => {
  const [settings, setSettings] = useState<CacheSettingsModel>({
    expiry_days: 7,
    max_size_mb: 100,
    cleanup_enabled: true,
    cleanup_on_start: true,
  });
  const [stats, setStats] = useState<CacheStatsModel>({
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
  const visibleSections = new Set(sections ?? ['stats', 'config', 'actions']);

  useEffect(() => {
    loadSettings();
    loadStats();

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
      setSettings(result as CacheSettingsModel);
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
      setStats(result as CacheStatsModel);
    } catch (err) {
      console.error('統計情報の読み込みに失敗:', err);
    }
  };

  const handleSettingChange = (key: keyof CacheSettingsModel, value: number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
      await loadStats();
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

      {visibleSections.has('stats') && <CacheStatsCard stats={stats} />}

      {visibleSections.has('config') && (
        <CacheConfigCard
          settings={settings}
          updating={updating}
          onChange={handleSettingChange}
          onSave={handleSaveSettings}
        />
      )}

      {visibleSections.has('actions') && (
        <CacheActionsCard
          cleaning={cleaning}
          clearing={clearing}
          onCleanupExpired={handleCleanupExpired}
          onClearCache={handleClearCache}
        />
      )}
    </div>
  );
};
