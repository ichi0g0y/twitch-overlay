import { ChevronDown, ChevronUp, Gift, Music, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from 'lucide-react';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { GetMusicPlaylists, GetServerPort } from '../../../bindings/github.com/nantokaworks/twitch-overlay/app.js';
import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { buildApiUrlAsync } from '../../utils/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
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
    authStatus,
  } = context;

  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [rewardGroups, setRewardGroups] = useState<Array<{id: number, name: string}>>([]);
  const [customRewards, setCustomRewards] = useState<Array<{id: string, title: string, cost: number}>>([]);
  const [rewardCounts, setRewardCounts] = useState<Array<{
    reward_id: string;
    count: number;
    title?: string;
    display_name?: string;
    user_names?: string[];
  }>>([]);
  const [groupRewardIds, setGroupRewardIds] = useState<Set<string>>(new Set());
  const groupRewardIdsRef = useRef<Set<string>>(new Set());
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  // カードの折りたたみ状態（overlaySettingsから復帰）
  const [expandedCards, setExpandedCards] = useState(() => {
    try {
      const savedState = overlaySettings?.overlay_cards_expanded;
      if (savedState) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.error('[OverlaySettings] Failed to parse card expanded state:', error);
    }
    // デフォルト値
    return {
      musicPlayer: true,
      fax: true,
      clock: true,
      rewardCount: true,
      lottery: true,
    };
  });

  // 初回マウント時の保存を防ぐフラグ
  const isInitialMount = useRef(true);
  // 前回のWebSocketから受信した値を保持（無限ループ防止）
  const previousSavedState = useRef<string | undefined>(undefined);
  // 前回保存した値を保持（無限ループ防止）
  const previousExpandedCards = useRef<string | undefined>(undefined);

  // overlaySettingsが更新されたら、カード状態も更新（無限ループ防止のため前回値と比較）
  useEffect(() => {
    try {
      const savedState = overlaySettings?.overlay_cards_expanded;
      // 前回の値と異なる場合のみ更新（無限ループ防止）
      if (savedState && savedState !== previousSavedState.current) {
        const parsed = JSON.parse(savedState);
        setExpandedCards(parsed);
        previousSavedState.current = savedState;
        previousExpandedCards.current = savedState; // 保存値も更新
      }
    } catch (error) {
      console.error('[OverlaySettings] Failed to parse card expanded state:', error);
    }
  }, [overlaySettings?.overlay_cards_expanded]);

  // カードの折りたたみ状態が変更されたらDBに保存
  useEffect(() => {
    // 初回マウント時はスキップ
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const jsonValue = JSON.stringify(expandedCards);

    // 前回保存した値と比較して、変わった場合のみ保存（無限ループ防止）
    if (jsonValue === previousExpandedCards.current) {
      return; // 変わっていないのでスキップ
    }

    const saveExpandedState = async () => {
      try {
        previousSavedState.current = jsonValue;
        previousExpandedCards.current = jsonValue;
        await updateOverlaySettings({ overlay_cards_expanded: jsonValue });
      } catch (error) {
        console.error('[OverlaySettings] Failed to save card expanded state:', error);
      }
    };
    saveExpandedState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCards]); // updateOverlaySettingsは安定しているので依存配列から除外

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

  // カスタムリワード一覧を取得
  useEffect(() => {
    const fetchCustomRewards = async () => {
      try {
        const url = await buildApiUrlAsync('/api/twitch/custom-rewards');
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setCustomRewards(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch custom rewards:', error);
      }
    };

    // 認証済みの場合のみ取得
    if (authStatus?.authenticated) {
      fetchCustomRewards();
    }
  }, [authStatus?.authenticated]);

  // グループに属するリワードIDを取得
  const fetchGroupMembership = async (groupId: number) => {
    try {
      const url = await buildApiUrlAsync(`/api/twitch/reward-groups/${groupId}`);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // data.reward_ids: string[]
        const newRewardIds = new Set<string>(data.reward_ids || []);
        setGroupRewardIds(newRewardIds);
        groupRewardIdsRef.current = newRewardIds;
        console.log('Group membership loaded:', {
          group_id: groupId,
          reward_count: data.reward_ids?.length || 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch group membership:', error);
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
    }
  };

  // リワードカウントを取得
  const fetchRewardCounts = async () => {
    try {
      const groupId = overlaySettings?.reward_count_group_id;

      // グループが選択されている場合、メンバーシップを取得
      if (groupId) {
        await fetchGroupMembership(groupId);
      } else {
        setGroupRewardIds(new Set()); // グループ未選択時はクリア
      }

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

  // グループリワードIDを取得（無限ループ防止のため、groupRewardIdsを依存配列に含めない）
  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
      return;
    }

    const groupId = overlaySettings?.reward_count_group_id;
    if (groupId) {
      fetchGroupMembership(groupId);
    } else {
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
    }
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  // 初回カウントデータ取得用のuseEffect
  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      setRewardCounts([]);
      return;
    }

    const fetchInitialCounts = async () => {
      try {
        const groupId = overlaySettings?.reward_count_group_id;
        const endpoint = groupId
          ? `/api/twitch/reward-groups/${groupId}/counts`
          : '/api/twitch/reward-counts';
        const url = await buildApiUrlAsync(endpoint);
        const response = await fetch(url);
        if (response.ok) {
          const counts = await response.json();
          setRewardCounts((counts || []).filter((c: any) => c.count > 0));
        }
      } catch (error) {
        console.error('Failed to fetch initial reward counts:', error);
      }
    };

    fetchInitialCounts();
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  // WebSocketリスナー登録用のuseEffect（reward_count_enabledとgroup_idのみに依存）
  useEffect(() => {
    if (!overlaySettings?.reward_count_enabled) {
      return;
    }

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

          // グループフィルタが有効な場合の処理（Refを使用）
          const groupId = overlaySettings?.reward_count_group_id;
          if (groupId) {
            // グループリワードIDをまだ取得していない場合は、イベントを無視（Refを使用）
            if (groupRewardIdsRef.current.size === 0) {
              console.log('⏳ Ignoring reward: group reward IDs not loaded yet', {
                reward_id: data.reward_id,
                reward_title: data.title,
                group_id: groupId
              });
              return;
            }
            // グループに属さないリワードは無視（Refを使用）
            if (!groupRewardIdsRef.current.has(data.reward_id)) {
              console.log('🚫 Skipping reward_count_updated: not in selected group', {
                reward_id: data.reward_id,
                reward_title: data.title,
                group_id: groupId,
                group_size: groupRewardIdsRef.current.size
              });
              return;
            }
          }

          // リワードカウントを更新
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
        // オーバーレイ未接続時でも永続化された状態を取得するため /api/music/state を使用
        const response = await fetch(`http://localhost:${port}/api/music/state`);
        if (response.ok) {
          const state = await response.json();
          // PlaybackState形式をMusicStatusUpdate形式に変換
          const status = {
            playback_status: state.playback_status ?? 'stopped',
            is_playing: state.is_playing ?? false,
            current_track: null, // /api/music/stateにはcurrent_trackが含まれていない
            current_time: state.position ?? 0,
            duration: state.duration ?? 0,
            volume: state.volume !== undefined ? state.volume : (overlaySettings?.music_volume ?? 100),
            playlist_name: state.playlist_name ?? undefined,
          };
          context.setMusicStatus?.(status);
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
    <div className="columns-1 lg:columns-2 gap-4 space-y-4 [&:focus]:outline-none [&:focus-visible]:outline-none">
      {/* 音楽プレイヤーコントロール */}
      <Card className="break-inside-avoid mb-4">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpandedCards(prev => ({ ...prev, musicPlayer: !prev.musicPlayer }))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle>再生コントロール</CardTitle>
              <CardDescription>
                オーバーレイの音楽プレイヤーをリモート操作します
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {expandedCards.musicPlayer ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {expandedCards.musicPlayer && (
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
        )}
      </Card>

      {/* FAX表示設定 */}
      <Card className="break-inside-avoid mb-4">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpandedCards(prev => ({ ...prev, fax: !prev.fax }))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle>FAX表示</CardTitle>
              <CardDescription>
                FAX受信時のアニメーション設定
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {expandedCards.fax ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {expandedCards.fax && (
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
        )}
      </Card>

      {/* 時計表示設定 */}
      <Card className="break-inside-avoid mb-4">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpandedCards(prev => ({ ...prev, clock: !prev.clock }))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle>時計表示</CardTitle>
              <CardDescription>
                オーバーレイの時計表示設定
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {expandedCards.clock ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {expandedCards.clock && (
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
        )}
      </Card>

      {/* リワードカウント表示設定 */}
      <Card className="break-inside-avoid mb-4">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpandedCards(prev => ({ ...prev, rewardCount: !prev.rewardCount }))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle>リワードカウント表示</CardTitle>
              <CardDescription>
                使用されたリワードの回数を蓄積表示します
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {expandedCards.rewardCount ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {expandedCards.rewardCount && (
          <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="reward-count-enabled" className="flex flex-col">
              <span>カウント表示を有効化</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                オーバーレイにリワード使用回数を表示します
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
              <div className="flex items-center justify-between">
                <Label htmlFor="reward-count-position" className="flex flex-col">
                  <span>右側に表示</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    オフの場合は左側に表示されます
                  </span>
                </Label>
                <Switch
                  id="reward-count-position"
                  checked={(overlaySettings?.reward_count_position || 'left') === 'right'}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({
                      reward_count_position: checked ? 'right' : 'left'
                    })
                  }
                />
              </div>

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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>現在表示中のリワード</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            // 設定画面のカウントデータを再取得
                            await fetchRewardCounts();
                            // オーバーレイに設定を再送信（強制リフレッシュ）
                            const url = await buildApiUrlAsync('/api/overlay/refresh');
                            await fetch(url, { method: 'POST' });
                          } catch (error) {
                            console.error('Failed to refresh:', error);
                          }
                        }}
                      >
                        🔄
                      </Button>
                      <Button
                        variant={resetAllConfirm ? "destructive" : "outline"}
                        size="sm"
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

                  {/* 各リワードをCardで表示 */}
                  <div className="space-y-3">
                    {rewardCounts.map((reward) => (
                      <Card key={reward.reward_id}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base text-left">
                            {reward.display_name || reward.title || reward.reward_id}
                          </CardTitle>
                          <CardDescription className="text-left">
                            カウント: {reward.count}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          {/* ユーザー名リスト */}
                          {reward.user_names && reward.user_names.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {reward.user_names.map((userName, index) => {
                                  const deleteKey = `${reward.reward_id}-${index}`;
                                  const isConfirming = deleteConfirmKey === deleteKey;

                                  return (
                                    <div
                                      key={index}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                        isConfirming
                                          ? 'bg-red-100 dark:bg-red-900/30'
                                          : 'bg-gray-100 dark:bg-gray-800'
                                      }`}
                                    >
                                      <span className="text-gray-700 dark:text-gray-300">{userName}</span>
                                      <button
                                        type="button"
                                        className={`ml-1 ${
                                          isConfirming
                                            ? 'text-red-600 dark:text-red-400 font-bold'
                                            : 'text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400'
                                        }`}
                                        onClick={async () => {
                                          // 1回目のクリック: 確認状態にする
                                          if (!isConfirming) {
                                            setDeleteConfirmKey(deleteKey);
                                            return;
                                          }

                                          // 2回目のクリック: 実際に削除
                                          try {
                                            const url = await buildApiUrlAsync(`/api/twitch/reward-counts/${reward.reward_id}/users/${index}`);
                                            const response = await fetch(url, { method: 'DELETE' });

                                            if (!response.ok) {
                                              const errorText = await response.text();
                                              throw new Error(`HTTP ${response.status}: ${errorText}`);
                                            }

                                            // 即座に再取得
                                            await fetchRewardCounts();
                                            setDeleteConfirmKey(null);
                                          } catch (error) {
                                            console.error('Failed to remove user:', error);
                                            alert(`ユーザー削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                                            setDeleteConfirmKey(null);
                                          }
                                        }}
                                        aria-label={`${userName}を削除`}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </CardContent>
        )}
      </Card>

      {/* プレゼントルーレット設定 */}
      <Card className="break-inside-avoid mb-4">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpandedCards(prev => ({ ...prev, lottery: !prev.lottery }))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                プレゼントルーレット
              </CardTitle>
              <CardDescription>
                チャンネルポイントリワードを使った抽選機能の設定
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {expandedCards.lottery ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {expandedCards.lottery && (
          <CardContent className="space-y-4">
            {/* LOTTERY_ENABLEDは廃止され、常に有効として扱われます */}
              <div className="space-y-2">
                <Label htmlFor="lottery-reward">抽選対象リワード</Label>
                {customRewards.length > 0 ? (
                  <Select
                    value={overlaySettings?.lottery_reward_id || ''}
                    onValueChange={(value) =>
                      updateOverlaySettings({
                        lottery_reward_id: value || null
                      })
                    }
                  >
                    <SelectTrigger id="lottery-reward">
                      <SelectValue placeholder="リワードを選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customRewards.map(reward => (
                        <SelectItem key={reward.id} value={reward.id}>
                          {reward.title} ({reward.cost}pt)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-500 dark:text-gray-400">
                    {authStatus?.authenticated
                      ? 'リワードを読み込み中...'
                      : 'Twitchタブで認証してください'}
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  このリワードを使用したユーザーが抽選対象になります
                </p>
              </div>

              {/* ティッカー表示設定 */}
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="lottery-ticker">オーバーレイでティッカー表示</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    参加者を画面最下部に横スクロール表示します
                  </p>
                </div>
                <Switch
                  id="lottery-ticker"
                  checked={overlaySettings?.lottery_ticker_enabled || false}
                  onCheckedChange={(checked) =>
                    updateOverlaySettings({ lottery_ticker_enabled: checked })
                  }
                />
              </div>

              {/* お知らせ文設定 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">お知らせ文設定</h4>

                {/* 有効/無効スイッチ */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ticker-notice">お知らせ文を表示</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ティッカーの上にお知らせ文を表示します
                    </p>
                  </div>
                  <Switch
                    id="ticker-notice"
                    checked={overlaySettings?.ticker_notice_enabled || false}
                    onCheckedChange={(checked) =>
                      updateOverlaySettings({ ticker_notice_enabled: checked })
                    }
                  />
                </div>

                {/* お知らせ文の内容 */}
                {overlaySettings?.ticker_notice_enabled && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="ticker-notice-text">お知らせ文</Label>
                      <Input
                        id="ticker-notice-text"
                        value={overlaySettings?.ticker_notice_text || ''}
                        onChange={(e) =>
                          updateOverlaySettings({ ticker_notice_text: e.target.value })
                        }
                        placeholder="お知らせ文を入力..."
                      />
                    </div>

                    {/* フォントサイズ */}
                    <div className="space-y-2">
                      <Label htmlFor="ticker-notice-font-size">
                        フォントサイズ (10-48px)
                      </Label>
                      <Input
                        id="ticker-notice-font-size"
                        type="number"
                        min={10}
                        max={48}
                        value={overlaySettings?.ticker_notice_font_size || 16}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (value >= 10 && value <= 48) {
                            updateOverlaySettings({ ticker_notice_font_size: value });
                          }
                        }}
                      />
                    </div>

                    {/* 配置 */}
                    <div className="space-y-2">
                      <Label htmlFor="ticker-notice-align">配置</Label>
                      <Select
                        value={overlaySettings?.ticker_notice_align || 'center'}
                        onValueChange={(value) =>
                          updateOverlaySettings({ ticker_notice_align: value })
                        }
                      >
                        <SelectTrigger id="ticker-notice-align">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">左寄せ</SelectItem>
                          <SelectItem value="center">中央</SelectItem>
                          <SelectItem value="right">右寄せ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};