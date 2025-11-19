import { Music, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from 'lucide-react';
import React, { useContext, useEffect, useState } from 'react';
import { GetMusicPlaylists, GetServerPort } from '../../../bindings/github.com/nantokaworks/twitch-overlay/app.js';
import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { buildApiUrlAsync } from '../../utils/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

export const OverlaySettings: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('OverlaySettings must be used within SettingsPageProvider');
  }

  const {
    getSettingValue,
    handleSettingChange,
    overlaySettings,
    updateOverlaySettings,
    musicStatus,
    playlists,
    isControlDisabled,
    seekBarRef,
    sendMusicControlCommand,
    handleSeek,
    formatTime,
    webServerPort,
  } = context;

  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [rewardGroups, setRewardGroups] = useState<Array<{id: number, name: string}>>([]);
  const [rewardCounts, setRewardCounts] = useState<Array<{
    reward_id: string;
    count: number;
    title?: string;
    display_name?: string;
    user_names?: string[];
  }>>([]);
  const [groupRewardIds, setGroupRewardIds] = useState<Set<string>>(new Set());
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  const [resetAllConfirm, setResetAllConfirm] = useState(false);

  // プレイリストを取得
  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const data = await GetMusicPlaylists();
        context.setPlaylists?.(data.playlists || []);
      } catch (error) {
        console.error('Failed to fetch playlists:', error);
      }
    };
    fetchPlaylists();
  }, []);

  // リワードグループを取得
  useEffect(() => {
    const fetchRewardGroups = async () => {
      try {
        const url = await buildApiUrlAsync('/api/twitch/reward-groups');
        const response = await fetch(url);
        if (response.ok) {
          const result = await response.json();
          // APIレスポンスは { data: [...] } の形式
          setRewardGroups(result.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch reward groups:', error);
      }
    };
    fetchRewardGroups();
  }, []);

  // リワードカウントを取得
  const fetchRewardCounts = async () => {
    try {
      const groupId = overlaySettings?.reward_count_group_id;
      const endpoint = groupId
        ? `/api/twitch/reward-groups/${groupId}/counts`
        : '/api/twitch/reward-counts';
      const url = await buildApiUrlAsync(endpoint);
      const response = await fetch(url);
      if (response.ok) {
        const counts = await response.json();
        // カウントが0より大きいものだけフィルタ
        setRewardCounts((counts || []).filter((c: any) => c.count > 0));
      }
    } catch (error) {
      console.error('Failed to fetch reward counts:', error);
    }
  };

  // リワードカウント表示が有効な場合、カウントを取得
  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      setRewardCounts([]);
      return;
    }

    // 初回取得
    fetchRewardCounts();

    // WebSocketでのリアルタイム更新
    let unsubUpdated: (() => void) | null = null;
    let unsubReset: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const { getWebSocketClient } = await import('../../utils/websocket');
        const wsClient = getWebSocketClient();

        // WebSocket接続を開始
        await wsClient.connect();

        // reward_count_updatedメッセージを購読（個別リワードの更新）
        unsubUpdated = wsClient.on('reward_count_updated', (data: any) => {
          console.log('Received reward_count_updated from WebSocket:', data);

          // リワードカウントを更新（グループフィルタは設定画面では適用しない）
          setRewardCounts(prev => {
            const filtered = prev.filter(c => c.reward_id !== data.reward_id);
            if (data.count > 0) {
              return [...filtered, {
                reward_id: data.reward_id,
                count: data.count,
                title: data.title,
                display_name: data.display_name,
                user_names: data.user_names
              }].sort((a, b) => b.count - a.count);
            }
            return filtered;
          });
        });

        // reward_counts_resetメッセージを購読（全リセット）
        unsubReset = wsClient.on('reward_counts_reset', () => {
          console.log('Received reward_counts_reset from WebSocket');
          setRewardCounts([]);
        });
      } catch (error) {
        console.error('Failed to setup WebSocket for reward counts:', error);
      }
    };

    setupWebSocket();

    return () => {
      if (unsubUpdated) unsubUpdated();
      if (unsubReset) unsubReset();
    };
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  // 音楽ステータスの更新を監視
  useEffect(() => {
    const fetchMusicStatus = async () => {
      try {
        const port = await GetServerPort();
        const response = await fetch(`http://localhost:${port}/api/music/status`);
        if (response.ok) {
          const status = await response.json();
          // オーバーレイ設定のボリュームをマージ
          const mergedStatus = {
            ...status,
            volume: status.volume !== undefined ? status.volume : (overlaySettings?.music_volume ?? 100)
          };
          context.setMusicStatus?.(mergedStatus);
        }
      } catch (error) {
        console.error('Failed to fetch music status:', error);
      }
    };

    // 初回取得
    fetchMusicStatus();

    // WebSocketでのリアルタイム更新（直接WebSocketに接続）
    let unsubscribe: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const { getWebSocketClient } = await import('../../utils/websocket');
        const wsClient = getWebSocketClient();

        // WebSocket接続を開始
        await wsClient.connect();

        // music_statusメッセージを購読
        unsubscribe = wsClient.on('music_status', (status: any) => {
          console.log('Received music_status from WebSocket:', status);
          // オーバーレイ設定のボリュームをマージ
          const mergedStatus = {
            ...status,
            volume: status.volume !== undefined ? status.volume : (overlaySettings?.music_volume ?? 100)
          };
          context.setMusicStatus?.(mergedStatus);
        });
      } catch (error) {
        console.error('Failed to setup WebSocket:', error);
      }
    };

    setupWebSocket();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // アートワークURLを更新
  useEffect(() => {
    const updateArtworkUrl = async () => {
      if (musicStatus.current_track?.has_artwork && musicStatus.current_track?.id) {
        try {
          const url = await buildApiUrlAsync(`/api/music/track/${musicStatus.current_track.id}/artwork`);
          setArtworkUrl(url);
        } catch (error) {
          console.error('Failed to build artwork URL:', error);
          setArtworkUrl(null);
        }
      } else {
        setArtworkUrl(null);
      }
    };
    updateArtworkUrl();
  }, [musicStatus.current_track]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 outline-none border-none">
      {/* 音楽プレイヤーコントロール */}
      <Card>
        <CardHeader>
          <CardTitle>再生コントロール</CardTitle>
          <CardDescription>
            オーバーレイの音楽プレイヤーをリモート操作します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 現在の曲情報 */}
          {musicStatus.current_track ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                {/* アートワーク */}
                <div className="w-12 h-12 flex-shrink-0">
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={musicStatus.current_track.title}
                      className="w-full h-full object-cover rounded"
                      onError={() => setArtworkUrl(null)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                      <Music className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* 曲情報 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{musicStatus.current_track.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {musicStatus.current_track.artist} • {formatTime(musicStatus.current_time)} / {formatTime(musicStatus.duration)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Music className="w-8 h-8 mx-auto mb-1 opacity-50" />
              <p className="text-sm">再生中の曲はありません</p>
            </div>
          )}

          {/* コントロールボタン */}
          <div className="flex items-center justify-center gap-1">
            <Button
              onClick={() => sendMusicControlCommand('previous')}
              size="sm"
              variant="outline"
              disabled={!musicStatus.current_track || isControlDisabled}
              className="h-9 w-9"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </Button>

            <Button
              onClick={() => sendMusicControlCommand(musicStatus.is_playing ? 'pause' : 'play')}
              size="sm"
              className="h-9 w-9"
              disabled={isControlDisabled}
            >
              {musicStatus.is_playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </Button>

            <Button
              onClick={() => sendMusicControlCommand('next')}
              size="sm"
              variant="outline"
              disabled={!musicStatus.current_track || isControlDisabled}
              className="h-9 w-9"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </Button>

            <Button
              onClick={() => sendMusicControlCommand('stop')}
              size="sm"
              variant="outline"
              className="ml-2 h-9 w-9"
              disabled={!musicStatus.current_track}
              title="停止"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* シークバー */}
          {musicStatus.current_track && (
            <div className="space-y-2">
              <input
                ref={seekBarRef}
                type="range"
                min="0"
                max={musicStatus.duration || 100}
                value={musicStatus.current_time || 0}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatTime(musicStatus.current_time)}</span>
                <span>進捗: {((musicStatus.current_time / (musicStatus.duration || 1)) * 100).toFixed(1)}%</span>
                <span>{formatTime(musicStatus.duration)}</span>
              </div>
            </div>
          )}

          {/* ボリューム */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-500" />
            <input
              type="range"
              min="0"
              max="100"
              value={musicStatus.volume}
              onChange={(e) => {
                const volume = Number(e.target.value);
                // 状態を即座に更新
                context.setMusicStatus?.(prev => ({
                  ...prev,
                  volume: volume
                }));
                // コマンドを送信
                sendMusicControlCommand('volume', { volume });
                // 設定にも保存
                updateOverlaySettings({ music_volume: volume });
              }}
              className="flex-1"
            />
            <span className="text-sm text-gray-500 w-10 text-right">
              {musicStatus.volume}%
            </span>
          </div>

          {/* プレイリスト選択 */}
          <div className="space-y-2">
            <Label htmlFor="playlist-select">プレイリスト</Label>
            <Select
              value={musicStatus.playlist_name || 'all'}
              onValueChange={async (value) => {
                // 状態を即座に更新
                context.setMusicStatus?.(prev => ({
                  ...prev,
                  playlist_name: value === 'all' ? undefined : value
                }));

                // プレイリストを読み込み
                await sendMusicControlCommand('load', { playlist: value === 'all' ? undefined : value });

                // プレイリスト選択を永続化
                try {
                  const url = await buildApiUrlAsync('/api/music/state/update');
                  await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      track_id: musicStatus.current_track?.id || '',
                      playlist_name: value === 'all' ? null : value,
                      position: 0,
                      duration: 0,
                      playback_status: 'stopped',
                      is_playing: false,
                      volume: musicStatus.volume
                    })
                  });
                } catch (error) {
                  console.error('Failed to save playlist selection:', error);
                }
              }}
            >
              <SelectTrigger id="playlist-select">
                <SelectValue placeholder="すべての曲" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての曲</SelectItem>
                {playlists.map(playlist => (
                  <SelectItem key={playlist.id} value={playlist.name}>
                    {playlist.name} ({playlist.track_count}曲)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* FAX表示設定 */}
      <Card>
        <CardHeader>
          <CardTitle>FAX表示</CardTitle>
          <CardDescription>
            FAX受信時のアニメーション設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="fax-enabled" className="flex flex-col">
              <span>FAXアニメーションを表示</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                FAX受信時にアニメーションを表示します
              </span>
            </Label>
            <Switch
              id="fax-enabled"
              checked={overlaySettings?.fax_enabled ?? true}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ fax_enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="fax-color-mode" className="flex flex-col">
              <span>カラーモード</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {overlaySettings?.fax_image_type === 'color'
                  ? 'カラー: 鮮やかな表示'
                  : 'モノクロ: クラシックなFAX風'}
              </span>
            </Label>
            <Switch
              id="fax-color-mode"
              checked={overlaySettings?.fax_image_type === 'color'}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ fax_image_type: checked ? 'color' : 'mono' })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fax-speed">
              アニメーション速度: {((overlaySettings?.fax_animation_speed ?? 1.0) * 100).toFixed(0)}%
            </Label>
            <input
              type="range"
              id="fax-speed"
              min="50"
              max="200"
              value={(overlaySettings?.fax_animation_speed ?? 1.0) * 100}
              onChange={(e) =>
                updateOverlaySettings({ fax_animation_speed: parseInt(e.target.value) / 100 })
              }
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* 時計表示設定 */}
      <Card>
        <CardHeader>
          <CardTitle>時計表示</CardTitle>
          <CardDescription>
            オーバーレイの時計表示設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="clock-enabled" className="flex flex-col">
              <span>時計を表示</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                オーバーレイに時計を表示します
              </span>
            </Label>
            <Switch
              id="clock-enabled"
              checked={overlaySettings?.clock_enabled ?? true}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ clock_enabled: checked })
              }
            />
          </div>

          {(overlaySettings?.clock_enabled ?? true) && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="location-enabled" className="flex flex-col">
                  <span>場所を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Hyogo, Japan
                  </span>
                </Label>
                <Switch
                  id="location-enabled"
                  checked={overlaySettings?.location_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ location_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="date-enabled" className="flex flex-col">
                  <span>日付を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    年月日と曜日
                  </span>
                </Label>
                <Switch
                  id="date-enabled"
                  checked={overlaySettings?.date_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ date_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="time-enabled" className="flex flex-col">
                  <span>時刻を表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    時:分
                  </span>
                </Label>
                <Switch
                  id="time-enabled"
                  checked={overlaySettings?.time_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ time_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="clock-show-icons" className="flex flex-col">
                  <span>アイコンを表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    場所・日付・時刻のアイコン
                  </span>
                </Label>
                <Switch
                  id="clock-show-icons"
                  checked={overlaySettings?.clock_show_icons ?? true}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ clock_show_icons: checked })
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* リワードカウント表示設定 */}
      <Card>
        <CardHeader>
          <CardTitle>リワードカウント表示</CardTitle>
          <CardDescription>
            使用されたリワードの回数を蓄積表示します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="reward-count-enabled" className="flex flex-col">
              <span>カウント表示を有効化</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                オーバーレイ左側にリワード使用回数を表示します
              </span>
            </Label>
            <Switch
              id="reward-count-enabled"
              checked={overlaySettings?.reward_count_enabled ?? false}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ reward_count_enabled: checked })
              }
            />
          </div>

          {(overlaySettings?.reward_count_enabled ?? false) && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reward-count-group">表示対象グループ</Label>
                <Select
                  value={overlaySettings?.reward_count_group_id?.toString() || 'all'}
                  onValueChange={(value) =>
                    updateOverlaySettings({
                      reward_count_group_id: value === 'all' ? null : parseInt(value)
                    })
                  }
                >
                  <SelectTrigger id="reward-count-group">
                    <SelectValue placeholder="すべてのリワード" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべてのリワード</SelectItem>
                    {rewardGroups.map(group => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  特定のグループのリワードのみカウント表示します
                </p>
              </div>

              {/* 現在のカウント一覧 */}
              {rewardCounts.length > 0 && (
                <div className="space-y-2">
                  <Label>現在表示中のリワード</Label>
                  <div className="max-h-60 overflow-y-auto border rounded-md divide-y divide-gray-200 dark:divide-gray-700">
                    {rewardCounts.map((reward) => (
                      <div
                        key={reward.reward_id}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-left">
                              {reward.display_name || reward.title || reward.reward_id}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-left">
                              カウント: {reward.count}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant={resetConfirmId === reward.reward_id ? "destructive" : "outline"}
                            size="sm"
                            className="ml-3 flex-shrink-0"
                            onClick={async () => {
                              console.log('🔘 Button clicked:', { reward_id: reward.reward_id, resetConfirmId });

                              // 1回目のクリック: 確認状態にする
                              if (resetConfirmId !== reward.reward_id) {
                                console.log('🔄 Setting confirm state');
                                setResetConfirmId(reward.reward_id);
                                return;
                              }

                              // 2回目のクリック: 実際にリセット
                              console.log('🔥 Executing reset');
                              try {
                                const url = await buildApiUrlAsync(`/api/twitch/reward-counts/${reward.reward_id}/reset`);
                                console.log('🔄 Resetting reward count:', { url, reward_id: reward.reward_id });
                                const response = await fetch(url, { method: 'POST' });
                                console.log('✅ Reset response:', response.status, response.statusText);

                                if (!response.ok) {
                                  const errorText = await response.text();
                                  throw new Error(`HTTP ${response.status}: ${errorText}`);
                                }

                                // 即座に再取得
                                await fetchRewardCounts();
                                setResetConfirmId(null);
                                alert('リセットしました');
                              } catch (error) {
                                console.error('❌ Failed to reset count:', error);
                                setResetConfirmId(null);
                                alert(`リセットに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                              }
                            }}
                          >
                            {resetConfirmId === reward.reward_id ? '本当にリセット？' : 'リセット'}
                          </Button>
                        </div>

                        {/* ユーザー名リスト */}
                        {reward.user_names && reward.user_names.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 text-left">
                              使用者:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {reward.user_names.map((userName, index) => (
                                <div
                                  key={index}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs"
                                >
                                  <span className="text-gray-700 dark:text-gray-300">{userName}</span>
                                  <button
                                    type="button"
                                    className="ml-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                    onClick={async () => {
                                      try {
                                        const url = await buildApiUrlAsync(`/api/twitch/reward-counts/${reward.reward_id}/users/${index}`);
                                        const response = await fetch(url, { method: 'DELETE' });

                                        if (!response.ok) {
                                          const errorText = await response.text();
                                          throw new Error(`HTTP ${response.status}: ${errorText}`);
                                        }

                                        // 即座に再取得
                                        await fetchRewardCounts();
                                      } catch (error) {
                                        console.error('Failed to remove user:', error);
                                        alert(`ユーザー削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                                      }
                                    }}
                                    aria-label={`${userName}を削除`}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant={resetAllConfirm ? "destructive" : "outline"}
                  onClick={async () => {
                    console.log('🔘 Reset all button clicked:', { resetAllConfirm });

                    // 1回目のクリック: 確認状態にする
                    if (!resetAllConfirm) {
                      console.log('🔄 Setting reset all confirm state');
                      setResetAllConfirm(true);
                      return;
                    }

                    // 2回目のクリック: 実際にリセット
                    console.log('🔥 Executing reset all');
                    try {
                      const url = await buildApiUrlAsync('/api/twitch/reward-counts/reset');
                      console.log('🔄 Resetting all reward counts:', url);
                      const response = await fetch(url, { method: 'POST' });
                      console.log('✅ Reset all response:', response.status, response.statusText);

                      if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                      }

                      // 即座に再取得
                      await fetchRewardCounts();
                      setResetAllConfirm(false);
                      alert('カウントをリセットしました');
                    } catch (error) {
                      console.error('❌ Failed to reset counts:', error);
                      setResetAllConfirm(false);
                      alert(`リセットに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                    }
                  }}
                >
                  {resetAllConfirm ? '本当に全リセット？' : 'すべてのカウントをリセット'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 開発者設定 */}
      <Card>
        <CardHeader>
          <CardTitle>開発者設定</CardTitle>
          <CardDescription>
            開発・デバッグ用の設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="debug-enabled" className="flex flex-col">
              <span>デバッグモード</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                デバッグパネルを表示してテスト機能を有効化します
              </span>
            </Label>
            <Switch
              id="debug-enabled"
              checked={overlaySettings?.debug_enabled ?? false}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ debug_enabled: checked })
              }
            />
          </div>

          {(overlaySettings?.debug_enabled ?? false) && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                デバッグモードが有効です。オーバーレイ画面でデバッグパネルが表示されます。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};