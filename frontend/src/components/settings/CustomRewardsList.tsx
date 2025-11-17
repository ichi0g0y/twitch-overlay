import React, { useEffect, useState } from 'react';
import { Award, Loader2, RefreshCw, AlertCircle, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { GetServerPort } from '../../../bindings/github.com/nantokaworks/twitch-overlay/app.js';

interface CustomReward {
  id: string;
  title: string;
  prompt: string;
  cost: number;
  is_enabled: boolean;
  background_color: string;
  is_user_input_required: boolean;
  is_paused: boolean;
  is_in_stock: boolean;
  redemptions_redeemed_current_stream?: number;
  max_per_stream_setting: {
    is_enabled: boolean;
    max_per_stream: number;
  };
  max_per_user_per_stream_setting: {
    is_enabled: boolean;
    max_per_user_per_stream: number;
  };
  global_cooldown_setting: {
    is_enabled: boolean;
    global_cooldown_seconds: number;
  };
}

interface CustomRewardsResponse {
  data: CustomReward[];
  error?: string;
}

export const CustomRewardsList: React.FC = () => {
  const [rewards, setRewards] = useState<CustomReward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRewards = async () => {
    setLoading(true);
    setError(null);

    try {
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/custom-rewards`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'カスタムリワードの取得に失敗しました');
      }

      const data: CustomRewardsResponse = await response.json();
      setRewards(data.data || []);
    } catch (err) {
      console.error('Failed to fetch custom rewards:', err);
      setError(err instanceof Error ? err.message : 'カスタムリワードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRewards();
  }, []);

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy ID:', err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="w-5 h-5" />
            <span>カスタムリワード一覧</span>
          </CardTitle>
          <CardDescription>
            チャンネルポイントで引き換え可能なカスタムリワード
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-500">読み込み中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="w-5 h-5" />
            <span>カスタムリワード一覧</span>
          </CardTitle>
          <CardDescription>
            チャンネルポイントで引き換え可能なカスタムリワード
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchRewards} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              再読み込み
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Award className="w-5 h-5" />
              <span>カスタムリワード一覧</span>
            </CardTitle>
            <CardDescription>
              チャンネルポイントで引き換え可能なカスタムリワード
            </CardDescription>
          </div>
          <Button onClick={fetchRewards} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            更新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rewards.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            カスタムリワードが見つかりません
          </div>
        ) : (
          <div className="space-y-4">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className="border dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: reward.background_color }}
                      />
                      <h3 className="font-semibold dark:text-white">
                        {reward.title}
                      </h3>
                      {!reward.is_enabled && (
                        <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
                          無効
                        </span>
                      )}
                      {reward.is_paused && (
                        <span className="text-xs px-2 py-1 bg-yellow-200 dark:bg-yellow-900 rounded">
                          一時停止
                        </span>
                      )}
                    </div>
                    {reward.prompt && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {reward.prompt}
                      </p>
                    )}
                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium">{reward.cost.toLocaleString()} pts</span>
                      {reward.is_user_input_required && (
                        <span>テキスト入力必須</span>
                      )}
                      {reward.redemptions_redeemed_current_stream !== undefined && (
                        <span>今日の引き換え: {reward.redemptions_redeemed_current_stream}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                      <span>ID:</span>
                      <span className="select-all">{reward.id}</span>
                    </div>
                    <Button
                      onClick={() => handleCopyId(reward.id)}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                    >
                      {copiedId === reward.id ? (
                        <>
                          <Check className="w-3 h-3 mr-1 text-green-500" />
                          <span className="text-xs text-green-500">コピーしました</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          <span className="text-xs">コピー</span>
                        </>
                      )}
                    </Button>
                  </div>
                  {/* 詳細情報 */}
                  <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {reward.max_per_stream_setting.is_enabled && (
                      <div>
                        配信ごとの上限: {reward.max_per_stream_setting.max_per_stream}
                      </div>
                    )}
                    {reward.max_per_user_per_stream_setting.is_enabled && (
                      <div>
                        ユーザーごとの上限: {reward.max_per_user_per_stream_setting.max_per_user_per_stream}
                      </div>
                    )}
                    {reward.global_cooldown_setting.is_enabled && (
                      <div>
                        クールダウン: {reward.global_cooldown_setting.global_cooldown_seconds}秒
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
