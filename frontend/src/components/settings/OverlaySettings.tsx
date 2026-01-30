import { ChevronDown, ChevronUp, Clock, Cpu, Gift, Hash, Mic, Music, Pause, Play, Printer, SkipBack, SkipForward, Square, Volume2 } from 'lucide-react';
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

type CardKey = 'musicPlayer' | 'fax' | 'clock' | 'openaiUsage' | 'micTranscript' | 'rewardCount' | 'lottery';
type ColumnKey = 'left' | 'right';
type CardsLayout = { left: CardKey[]; right: CardKey[] };

const CARD_KEYS: CardKey[] = ['musicPlayer', 'fax', 'clock', 'openaiUsage', 'micTranscript', 'rewardCount', 'lottery'];
const DEFAULT_CARDS_LAYOUT: CardsLayout = {
  left: ['musicPlayer', 'fax', 'clock', 'openaiUsage', 'micTranscript'],
  right: ['rewardCount', 'lottery'],
};

const isCardKey = (value: string): value is CardKey => CARD_KEYS.includes(value as CardKey);

const normalizeCardsLayout = (layout?: Partial<CardsLayout> | null): CardsLayout => {
  const rawLeft = Array.isArray(layout?.left) ? layout?.left : [];
  const rawRight = Array.isArray(layout?.right) ? layout?.right : [];
  const used = new Set<CardKey>();
  const pick = (items: unknown[]) => {
    const result: CardKey[] = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (!isCardKey(item)) continue;
      if (used.has(item)) continue;
      used.add(item);
      result.push(item);
    }
    return result;
  };
  const left = pick(rawLeft);
  const right = pick(rawRight);

  for (const key of CARD_KEYS) {
    if (!used.has(key)) {
      left.push(key);
    }
  }

  return { left, right };
};

const parseCardsLayout = (value?: string): CardsLayout => {
  if (!value) return DEFAULT_CARDS_LAYOUT;
  try {
    return normalizeCardsLayout(JSON.parse(value));
  } catch (error) {
    console.error('[OverlaySettings] Failed to parse card layout:', error);
    return DEFAULT_CARDS_LAYOUT;
  }
};

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
    resettingOpenAIUsage,
    handleResetOpenAIUsageDaily,
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
  const dailyInputTokens = parseInt(getSettingValue('OPENAI_USAGE_DAILY_INPUT_TOKENS') || '0', 10) || 0;
  const dailyOutputTokens = parseInt(getSettingValue('OPENAI_USAGE_DAILY_OUTPUT_TOKENS') || '0', 10) || 0;
  const dailyTotalTokens = dailyInputTokens + dailyOutputTokens;
  const dailyCostUsd = parseFloat(getSettingValue('OPENAI_USAGE_DAILY_COST_USD') || '0') || 0;
  const dailyDate = getSettingValue('OPENAI_USAGE_DAILY_DATE') || '未集計';
  const timeZone = getSettingValue('TIMEZONE') || 'UTC';
  const formatNumber = (value: number) => value.toLocaleString('ja-JP');
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

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
      openaiUsage: true,
      micTranscript: true,
      rewardCount: true,
      lottery: true,
    };
  });

  const [cardsLayout, setCardsLayout] = useState<CardsLayout>(() =>
    parseCardsLayout(overlaySettings?.overlay_cards_layout)
  );
  const [draggingCard, setDraggingCard] = useState<CardKey | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<{ column: ColumnKey; index: number } | null>(null);
  const [draggingCardExpanded, setDraggingCardExpanded] = useState<boolean | null>(null);

  // 初回マウント時の保存を防ぐフラグ
  const isInitialMount = useRef(true);
  // 前回のWebSocketから受信した値を保持（無限ループ防止）
  const previousSavedState = useRef<string | undefined>(undefined);
  // 前回保存した値を保持（無限ループ防止）
  const previousExpandedCards = useRef<string | undefined>(undefined);
  const isLayoutInitialMount = useRef(true);
  const previousLayoutSavedState = useRef<string | undefined>(undefined);
  const previousLayoutState = useRef<string | undefined>(undefined);

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

  // overlaySettingsが更新されたら、カードレイアウトも更新（無限ループ防止のため前回値と比較）
  useEffect(() => {
    const savedLayout = overlaySettings?.overlay_cards_layout;
    if (!savedLayout || savedLayout === previousLayoutSavedState.current) {
      return;
    }

    const parsedLayout = parseCardsLayout(savedLayout);
    setCardsLayout(parsedLayout);
    previousLayoutSavedState.current = savedLayout;
    previousLayoutState.current = JSON.stringify(parsedLayout);
  }, [overlaySettings?.overlay_cards_layout]);

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

  // カードレイアウトが変更されたらDBに保存
  useEffect(() => {
    if (isLayoutInitialMount.current) {
      isLayoutInitialMount.current = false;
      return;
    }

    const normalized = normalizeCardsLayout(cardsLayout);
    const jsonValue = JSON.stringify(normalized);

    if (jsonValue === previousLayoutState.current) {
      return;
    }

    const saveLayoutState = async () => {
      try {
        previousLayoutSavedState.current = jsonValue;
        previousLayoutState.current = jsonValue;
        await updateOverlaySettings({ overlay_cards_layout: jsonValue });
      } catch (error) {
        console.error('[OverlaySettings] Failed to save card layout:', error);
      }
    };

    saveLayoutState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsLayout]);

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

  const getCardKeyFromDragEvent = (event: React.DragEvent): CardKey | null => {
    const rawKey = event.dataTransfer.getData('text/plain');
    if (rawKey && isCardKey(rawKey)) {
      return rawKey;
    }
    return null;
  };

  const moveCard = (cardKey: CardKey, targetColumn: ColumnKey, targetIndex: number | null) => {
    setCardsLayout(prev => {
      const sourceColumn: ColumnKey = prev.left.includes(cardKey) ? 'left' : 'right';
      const sourceIndex = sourceColumn === 'left' ? prev.left.indexOf(cardKey) : prev.right.indexOf(cardKey);

      const left = prev.left.filter(key => key !== cardKey);
      const right = prev.right.filter(key => key !== cardKey);

      let targetList = targetColumn === 'left' ? left : right;
      let insertIndex = targetIndex ?? targetList.length;

      if (sourceColumn === targetColumn && sourceIndex !== -1 && targetIndex !== null && targetIndex > sourceIndex) {
        insertIndex -= 1;
      }

      if (insertIndex < 0) insertIndex = 0;
      if (insertIndex > targetList.length) insertIndex = targetList.length;

      targetList = [
        ...targetList.slice(0, insertIndex),
        cardKey,
        ...targetList.slice(insertIndex),
      ];

      const nextLayout =
        targetColumn === 'left'
          ? { left: targetList, right }
          : { left, right: targetList };

      return normalizeCardsLayout(nextLayout);
    });
  };

  const handleDragStart = (cardKey: CardKey, column: ColumnKey) => (event: React.DragEvent) => {
    event.dataTransfer.setData('text/plain', cardKey);
    event.dataTransfer.setData('application/x-card-column', column);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingCard(cardKey);
    setDraggingCardExpanded(expandedCards[cardKey]);
  };

  const handleDragEnd = () => {
    setDraggingCard(null);
    setDragOverPosition(null);
    setDraggingCardExpanded(null);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnColumn = (column: ColumnKey) => (event: React.DragEvent) => {
    event.preventDefault();
    const cardKey = getCardKeyFromDragEvent(event);
    if (!cardKey) return;
    moveCard(cardKey, column, null);
    setDragOverPosition(null);
  };

  const handleDropOnCard = (column: ColumnKey, index: number) => (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const cardKey = getCardKeyFromDragEvent(event);
    if (!cardKey) return;
    moveCard(cardKey, column, index);
    setDragOverPosition(null);
  };

  const handleDragOverZone = (column: ColumnKey, index: number) => (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverPosition({ column, index });
  };

  const renderMusicPlayerCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.musicPlayer : expandedCards.musicPlayer;
    const isDraggingSelf = draggingCard === 'musicPlayer';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
    <Card className={cardClassName}>
      <CardHeader
        className={headerClassName}
        onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, musicPlayer: !prev.musicPlayer }))}
        draggable={!isPreview}
        onDragStart={isPreview ? undefined : handleDragStart('musicPlayer', column)}
        onDragEnd={isPreview ? undefined : handleDragEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              再生コントロール
            </CardTitle>
            <CardDescription className="text-left">
              オーバーレイの音楽プレイヤーをリモート操作します
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 text-left">
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
    );
  };

  const renderFaxCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.fax : expandedCards.fax;
    const isDraggingSelf = draggingCard === 'fax';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
    <Card className={cardClassName}>
      <CardHeader
        className={headerClassName}
        onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, fax: !prev.fax }))}
        draggable={!isPreview}
        onDragStart={isPreview ? undefined : handleDragStart('fax', column)}
        onDragEnd={isPreview ? undefined : handleDragEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4" />
              FAX表示
            </CardTitle>
            <CardDescription className="text-left">
              FAX受信時のアニメーション設定
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 text-left">
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
    );
  };

  const renderClockCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.clock : expandedCards.clock;
    const isDraggingSelf = draggingCard === 'clock';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
    <Card className={cardClassName}>
      <CardHeader
        className={headerClassName}
        onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, clock: !prev.clock }))}
        draggable={!isPreview}
        onDragStart={isPreview ? undefined : handleDragStart('clock', column)}
        onDragEnd={isPreview ? undefined : handleDragEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              時計表示
            </CardTitle>
            <CardDescription className="text-left">
              オーバーレイの時計表示設定
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 text-left">
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
    );
  };

  const renderOpenAIUsageCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.openaiUsage : expandedCards.openaiUsage;
    const isDraggingSelf = draggingCard === 'openaiUsage';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
      <Card className={cardClassName}>
        <CardHeader
          className={headerClassName}
          onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, openaiUsage: !prev.openaiUsage }))}
          draggable={!isPreview}
          onDragStart={isPreview ? undefined : handleDragStart('openaiUsage', column)}
          onDragEnd={isPreview ? undefined : handleDragEnd}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                OpenAI使用量
              </CardTitle>
              <CardDescription className="text-left">
                文字起こし翻訳の使用量を時計の下に表示します
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>表示を有効化</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  時計の下に今日の使用量を表示します
                </p>
              </div>
              <Switch
                checked={overlaySettings?.openai_usage_enabled ?? false}
                onCheckedChange={(checked) => updateOverlaySettings({ openai_usage_enabled: checked })}
              />
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">今日の使用量</div>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {dailyDate}（{timeZone}）
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">入力</div>
                  <div className="mt-1 font-semibold">{formatNumber(dailyInputTokens)}</div>
                </div>
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">出力</div>
                  <div className="mt-1 font-semibold">{formatNumber(dailyOutputTokens)}</div>
                </div>
                <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">合計</div>
                  <div className="mt-1 font-semibold">{formatNumber(dailyTotalTokens)}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <span>推定料金: <span className="font-semibold">{formatUsd(dailyCostUsd)}</span></span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetOpenAIUsageDaily}
                  disabled={resettingOpenAIUsage}
                >
                  {resettingOpenAIUsage ? 'リセット中…' : '今日の使用量をリセット'}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderMicTranscriptCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.micTranscript : expandedCards.micTranscript;
    const isDraggingSelf = draggingCard === 'micTranscript';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    const positionValue = overlaySettings?.mic_transcript_position || 'bottom-left';

    return (
      <Card className={cardClassName}>
        <CardHeader
          className={headerClassName}
          onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, micTranscript: !prev.micTranscript }))}
          draggable={!isPreview}
          onDragStart={isPreview ? undefined : handleDragStart('micTranscript', column)}
          onDragEnd={isPreview ? undefined : handleDragEnd}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                マイク文字起こし
              </CardTitle>
              <CardDescription className="text-left">
                mic-recog の文字起こしをオーバーレイに表示します
              </CardDescription>
            </div>
            <div className="flex-shrink-0 pt-1">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>表示を有効化</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  受信した文字起こしをオーバーレイに表示します
                </p>
              </div>
              <Switch
                checked={overlaySettings?.mic_transcript_enabled ?? false}
                onCheckedChange={(checked) => updateOverlaySettings({ mic_transcript_enabled: checked })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>表示位置</Label>
                <Select
                  value={positionValue}
                  onValueChange={(value) => updateOverlaySettings({ mic_transcript_position: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="表示位置を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-left">左下</SelectItem>
                    <SelectItem value="bottom-center">中央下</SelectItem>
                    <SelectItem value="bottom-right">右下</SelectItem>
                    <SelectItem value="top-left">左上</SelectItem>
                    <SelectItem value="top-center">中央上</SelectItem>
                    <SelectItem value="top-right">右上</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-font-size">文字サイズ</Label>
                <Input
                  id="mic-font-size"
                  type="number"
                  min="10"
                  max="80"
                  value={overlaySettings?.mic_transcript_font_size ?? 20}
                  onChange={(e) => updateOverlaySettings({ mic_transcript_font_size: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mic-max-lines">最大行数</Label>
                <Input
                  id="mic-max-lines"
                  type="number"
                  min="1"
                  max="10"
                  value={overlaySettings?.mic_transcript_max_lines ?? 3}
                  onChange={(e) => updateOverlaySettings({ mic_transcript_max_lines: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mic-line-ttl">通常行の表示秒数</Label>
                <Input
                  id="mic-line-ttl"
                  type="number"
                  min="1"
                  max="300"
                  value={overlaySettings?.mic_transcript_line_ttl_seconds ?? 8}
                  onChange={(e) =>
                    updateOverlaySettings({ mic_transcript_line_ttl_seconds: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-last-ttl">最後の行の表示秒数（0で無限）</Label>
                <Input
                  id="mic-last-ttl"
                  type="number"
                  min="0"
                  max="300"
                  value={overlaySettings?.mic_transcript_last_ttl_seconds ?? 8}
                  onChange={(e) =>
                    updateOverlaySettings({ mic_transcript_last_ttl_seconds: parseInt(e.target.value, 10) || 0 })}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  0を指定すると次の発言が来るまで残ります
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>翻訳モード</Label>
              <Select
                value={
                  overlaySettings?.mic_transcript_translation_mode
                  ?? ((overlaySettings?.mic_transcript_translation_enabled ?? false) ? 'openai' : 'off')
                }
                onValueChange={(value) =>
                  updateOverlaySettings({
                    mic_transcript_translation_mode: value,
                    mic_transcript_translation_enabled: value !== 'off',
                  })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="翻訳モードを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">オフ</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama（ローカル）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                確定文を指定言語へ翻訳して表示します
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>翻訳先言語</Label>
                <Select
                  value={overlaySettings?.mic_transcript_translation_language ?? 'eng'}
                  onValueChange={(value) => updateOverlaySettings({ mic_transcript_translation_language: value })}
                  disabled={(overlaySettings?.mic_transcript_translation_mode ?? 'off') === 'off'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="言語を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eng">英語（eng）</SelectItem>
                    <SelectItem value="zho">中国語（zho）</SelectItem>
                    <SelectItem value="kor">韓国語（kor）</SelectItem>
                    <SelectItem value="fra">フランス語（fra）</SelectItem>
                    <SelectItem value="deu">ドイツ語（deu）</SelectItem>
                    <SelectItem value="spa">スペイン語（spa）</SelectItem>
                    <SelectItem value="por">ポルトガル語（por）</SelectItem>
                    <SelectItem value="rus">ロシア語（rus）</SelectItem>
                    <SelectItem value="ita">イタリア語（ita）</SelectItem>
                    <SelectItem value="ind">インドネシア語（ind）</SelectItem>
                    <SelectItem value="tha">タイ語（tha）</SelectItem>
                    <SelectItem value="vie">ベトナム語（vie）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mic-translation-font">翻訳文字サイズ</Label>
                <Input
                  id="mic-translation-font"
                  type="number"
                  min="10"
                  max="80"
                  value={overlaySettings?.mic_transcript_translation_font_size ?? 16}
                  onChange={(e) =>
                    updateOverlaySettings({ mic_transcript_translation_font_size: parseInt(e.target.value, 10) || 0 })}
                  disabled={(overlaySettings?.mic_transcript_translation_mode ?? 'off') === 'off'}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderRewardCountCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.rewardCount : expandedCards.rewardCount;
    const isDraggingSelf = draggingCard === 'rewardCount';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
    <Card className={cardClassName}>
      <CardHeader
        className={headerClassName}
        onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, rewardCount: !prev.rewardCount }))}
        draggable={!isPreview}
        onDragStart={isPreview ? undefined : handleDragStart('rewardCount', column)}
        onDragEnd={isPreview ? undefined : handleDragEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              リワードカウント表示
            </CardTitle>
            <CardDescription className="text-left">
              使用されたリワードの回数を蓄積表示します
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 text-left">
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
                      <CardContent className="space-y-1 text-left">
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
    );
  };

  const renderLotteryCard = (column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    const isPreview = options?.preview ?? false;
    const isExpanded = isPreview ? options?.previewExpanded ?? expandedCards.lottery : expandedCards.lottery;
    const isDraggingSelf = draggingCard === 'lottery';
    const cardClassName = `break-inside-avoid${isPreview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!isPreview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
    const headerClassName = isPreview
      ? 'cursor-default'
      : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

    return (
    <Card className={cardClassName}>
      <CardHeader
        className={headerClassName}
        onClick={isPreview ? undefined : () => setExpandedCards(prev => ({ ...prev, lottery: !prev.lottery }))}
        draggable={!isPreview}
        onDragStart={isPreview ? undefined : handleDragStart('lottery', column)}
        onDragEnd={isPreview ? undefined : handleDragEnd}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4" />
              プレゼントルーレット
            </CardTitle>
            <CardDescription className="text-left">
              チャンネルポイントリワードを使った抽選機能の設定
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 text-left">
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
    );
  };

  const renderCard = (cardKey: CardKey, column: ColumnKey, options?: { preview?: boolean; previewExpanded?: boolean }) => {
    switch (cardKey) {
      case 'musicPlayer':
        return renderMusicPlayerCard(column, options);
      case 'fax':
        return renderFaxCard(column, options);
      case 'clock':
        return renderClockCard(column, options);
      case 'openaiUsage':
        return renderOpenAIUsageCard(column, options);
      case 'micTranscript':
        return renderMicTranscriptCard(column, options);
      case 'rewardCount':
        return renderRewardCountCard(column, options);
      case 'lottery':
        return renderLotteryCard(column, options);
      default:
        return null;
    }
  };
  const renderCardPreview = (cardKey: CardKey, column: ColumnKey) =>
    renderCard(cardKey, column, {
      preview: true,
      previewExpanded: draggingCard === cardKey ? draggingCardExpanded ?? expandedCards[cardKey] : expandedCards[cardKey],
    });

  const renderDropZone = (column: ColumnKey, index: number) => {
    const isActive =
      !!draggingCard &&
      dragOverPosition?.column === column &&
      dragOverPosition?.index === index;
    const isLastPosition = index === cardsLayout[column].length;

    const baseClass = draggingCard ? 'h-2' : 'h-0';
    const spacingClass = isActive ? (isLastPosition ? 'mt-4' : 'mb-4') : '';
    const activeClass = isActive ? `h-auto ${spacingClass}` : '';

    return (
      <div
        className={`${baseClass} ${activeClass} rounded-md transition-all duration-150`}
        onDragOver={handleDragOverZone(column, index)}
        onDrop={handleDropOnCard(column, index)}
      >
        {isActive && draggingCard ? renderCardPreview(draggingCard, column) : null}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [&:focus]:outline-none [&:focus-visible]:outline-none">
      {(['left', 'right'] as ColumnKey[]).map((column) => (
        <div
          key={column}
          className="flex flex-col min-h-[60px]"
          onDragOver={handleDragOver}
          onDrop={handleDropOnColumn(column)}
        >
          {cardsLayout[column].map((cardKey, index) => (
            <div
              key={cardKey}
              className={index < cardsLayout[column].length - 1 ? 'mb-4' : ''}
            >
              {renderDropZone(column, index)}
              {renderCard(cardKey, column)}
            </div>
          ))}
          {renderDropZone(column, cardsLayout[column].length)}
        </div>
      ))}
    </div>
  );
};
