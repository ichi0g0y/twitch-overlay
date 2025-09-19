import React, { useContext, useEffect, useState } from 'react';
import { Music, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { GetMusicPlaylists, GetServerPort } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { buildApiUrlAsync } from '../../utils/api';

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

    // WebSocketでのリアルタイム更新
    const unsubscribe = EventsOn('music_status_update', (status) => {
      context.setMusicStatus?.(status);
    });

    return () => {
      unsubscribe();
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

      {/* 統計情報設定 */}
      <Card>
        <CardHeader>
          <CardTitle>統計情報表示</CardTitle>
          <CardDescription>
            オーバーレイに表示する統計情報の値を設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clock-weight">おもさ (kg)</Label>
            <Input
              id="clock-weight"
              type="text"
              placeholder="例: 75.4"
              value={getSettingValue('CLOCK_WEIGHT') || '75.4'}
              onChange={(e) =>
                handleSettingChange('CLOCK_WEIGHT', e.target.value)
              }
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clock-wallet">さいふ (えん)</Label>
            <Input
              id="clock-wallet"
              type="text"
              placeholder="例: 10387"
              value={getSettingValue('CLOCK_WALLET') || '10387'}
              onChange={(e) =>
                handleSettingChange('CLOCK_WALLET', e.target.value)
              }
              className="font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              数値のみ入力してください。自動的にカンマ区切りで表示されます。
            </p>
          </div>
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