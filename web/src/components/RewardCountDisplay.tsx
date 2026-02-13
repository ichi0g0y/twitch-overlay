import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { getWebSocketClient } from '../utils/websocket';
import { buildApiUrl } from '../utils/api';
import { RewardCount, RewardCountItemState } from '../types';
import { RewardCountItem } from './RewardCountItem';

const RewardCountDisplay: React.FC = () => {
  const { settings } = useSettings();
  const [counts, setCounts] = useState<Map<string, RewardCountItemState>>(new Map());
  const [groupRewardIds, setGroupRewardIds] = useState<Set<string>>(new Set());
  const groupRewardIdsRef = useRef<Set<string>>(new Set());

  // 設定が有効かチェック
  const isEnabled = settings?.reward_count_enabled ?? false;
  const groupId = settings?.reward_count_group_id;
  const position = settings?.reward_count_position ?? 'left'; // デフォルトは左

  // アラート音声を再生する関数
  const playAlertSound = useCallback(() => {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.5; // 音量を50%に設定
    audio.play().catch((err) => {
      console.error('Failed to play alert sound:', err);
    });
  }, []);

  // グループのリワードIDリストを取得（初回＋定期更新）
  useEffect(() => {
    if (!isEnabled || !groupId) {
      setGroupRewardIds(new Set());
      groupRewardIdsRef.current = new Set();
      return;
    }

    const fetchGroupRewardIds = async () => {
      try {
        const url = buildApiUrl(`/api/twitch/reward-groups/${groupId}`);
        const response = await fetch(url);
        if (response.ok) {
          const group = await response.json();
          const newRewardIds = new Set<string>(group.reward_ids || []);
          setGroupRewardIds(newRewardIds);
          groupRewardIdsRef.current = newRewardIds;
          console.log('🔄 Group reward IDs updated:', group.reward_ids?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch group reward IDs:', error);
        setGroupRewardIds(new Set());
        groupRewardIdsRef.current = new Set();
      }
    };

    // 初回取得
    fetchGroupRewardIds();

    // 30秒ごとに定期更新（グループメンバーシップの変更に対応）
    const intervalId = setInterval(fetchGroupRewardIds, 30000);

    return () => clearInterval(intervalId);
  }, [isEnabled, groupId]);

  // カウントデータの初期ロード
  useEffect(() => {
    if (!isEnabled) return;

    const fetchCounts = async () => {
      try {
        const url = groupId
          ? buildApiUrl(`/api/twitch/reward-groups/${groupId}/counts`)
          : buildApiUrl('/api/twitch/reward-counts');

        const response = await fetch(url);
        if (response.ok) {
          const data: RewardCount[] = await response.json();
          const newCounts = new Map<string, RewardCountItemState>();

          // カウントが0でないものだけを表示
          data.forEach((item) => {
            if (item.count > 0) {
              newCounts.set(item.reward_id, {
                rewardId: item.reward_id,
                count: item.count,
                userNames: item.user_names || [],
                displayName: item.display_name || item.title || '未設定',
                state: 'entering',
              });
            }
          });

          setCounts(newCounts);
        }
      } catch (error) {
        console.error('Failed to fetch reward counts:', error);
      }
    };

    fetchCounts();
  }, [isEnabled, groupId]);

  // WebSocketでカウント更新を監視
  useEffect(() => {
    if (!isEnabled) return;

    const wsClient = getWebSocketClient();

    // reward_count_updated イベントを購読
    const unsubCountUpdated = wsClient.on('reward_count_updated', (data: RewardCount) => {
      console.log('📊 Reward count updated:', data);

      // グループフィルタが有効な場合の処理（Refを使用）
      if (groupId) {
        // グループリワードIDをまだ取得していない場合は、イベントを無視（Refを使用）
        if (groupRewardIdsRef.current.size === 0) {
          console.log('⏳ Ignoring reward: group reward IDs not loaded yet', data.reward_id);
          return;
        }
        // グループに属さないリワードは無視（Refを使用）
        if (!groupRewardIdsRef.current.has(data.reward_id)) {
          console.log('🚫 Ignoring reward: not in selected group', data.reward_id);
          return;
        }
      }

      setCounts((prev) => {
        const newCounts = new Map(prev);

        if (data.count === 0) {
          // カウントが0になった場合は削除アニメーション（音声は再生しない）
          const existing = newCounts.get(data.reward_id);
          if (existing) {
            newCounts.set(data.reward_id, { ...existing, state: 'exiting' });
            // アニメーション後に削除
            setTimeout(() => {
              setCounts((current) => {
                const updated = new Map(current);
                updated.delete(data.reward_id);
                return updated;
              });
            }, 300); // アニメーション時間と合わせる
          }
        } else {
          // カウント追加または更新
          // アラート音声の再生条件：
          // - reward_count_enabled が true（isEnabledで既にチェック済み）
          // - グループフィルタが無効、またはグループに属するリワード（上でチェック済み）
          playAlertSound();

          const existing = newCounts.get(data.reward_id);
          if (existing) {
            // 既存アイテムを更新
            newCounts.set(data.reward_id, {
              ...existing,
              count: data.count,
              userNames: data.user_names || [],
              displayName: data.display_name || data.title || existing.displayName,
            });
          } else {
            // 新規アイテムを追加（entering状態で）
            newCounts.set(data.reward_id, {
              rewardId: data.reward_id,
              count: data.count,
              userNames: data.user_names || [],
              displayName: data.display_name || data.title || '未設定',
              state: 'entering',
            });
          }
        }

        return newCounts;
      });
    });

    // reward_counts_reset イベントを購読
    const unsubCountsReset = wsClient.on('reward_counts_reset', () => {
      console.log('📊 All reward counts reset');
      // 全てのアイテムを削除アニメーション
      setCounts((prev) => {
        const newCounts = new Map(prev);
        newCounts.forEach((item, key) => {
          newCounts.set(key, { ...item, state: 'exiting' });
        });
        return newCounts;
      });
      // アニメーション後にクリア
      setTimeout(() => {
        setCounts(new Map());
      }, 300);
    });

    return () => {
      unsubCountUpdated();
      unsubCountsReset();
    };
  }, [isEnabled, groupId, playAlertSound]);

  // entering状態のアイテムをvisibleに変更するEffect
  useEffect(() => {
    const enteringItems = Array.from(counts.entries()).filter(
      ([_, item]) => item.state === 'entering'
    );

    if (enteringItems.length === 0) return;

    const timer = setTimeout(() => {
      setCounts((current) => {
        const updated = new Map(current);
        enteringItems.forEach(([rewardId, _]) => {
          const item = updated.get(rewardId);
          if (item && item.state === 'entering') {
            updated.set(rewardId, { ...item, state: 'visible' });
          }
        });
        return updated;
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [counts]);

  // ポーリングフォールバック：WebSocketメッセージがドロップされた場合の補正
  useEffect(() => {
    if (!isEnabled) return;

    const intervalId = setInterval(async () => {
      try {
        const url = groupId
          ? buildApiUrl(`/api/twitch/reward-groups/${groupId}/counts`)
          : buildApiUrl('/api/twitch/reward-counts');

        const response = await fetch(url);
        if (response.ok) {
          const data: RewardCount[] = await response.json();
          setCounts((prev) => {
            const newCounts = new Map(prev);

            // APIから取得したデータと現在の表示を比較して差分を補正
            data.forEach((item) => {
              // グループフィルタが有効な場合、グループに属するリワードかチェック
              if (groupId && groupRewardIds.size > 0 && !groupRewardIds.has(item.reward_id)) {
                return; // このリワードはスキップ
              }

              if (item.count > 0) {
                const existing = newCounts.get(item.reward_id);
                if (!existing) {
                  // WebSocketで受信していない新規アイテムを追加
                  console.log('🔄 Polling: Adding missing reward', item.reward_id);
                  newCounts.set(item.reward_id, {
                    rewardId: item.reward_id,
                    count: item.count,
                    userNames: item.user_names || [],
                    displayName: item.display_name || item.title || '未設定',
                    state: 'entering',
                  });
                } else if (existing.count !== item.count) {
                  // カウントがずれている場合は補正
                  console.log('🔄 Polling: Correcting count mismatch', item.reward_id, existing.count, '→', item.count);
                  newCounts.set(item.reward_id, {
                    ...existing,
                    count: item.count,
                    userNames: item.user_names || [],
                    displayName: item.display_name || item.title || existing.displayName,
                  });
                }
              }
            });

            return newCounts;
          });
        }
      } catch (error) {
        console.error('Failed to sync reward counts via polling:', error);
      }
    }, 5000); // 5秒ごとに同期

    return () => clearInterval(intervalId);
  }, [isEnabled, groupId]);

  if (!isEnabled) {
    return null;
  }

  // カウントを配列に変換してソート（更新時刻の新しい順）
  const countArray = Array.from(counts.values()).sort(() => {
    // 常に最新の更新を上に表示
    return 0; // 挿入順を維持（Mapは挿入順を保持）
  });

  // 位置に応じたCSSクラスを生成
  const positionClass = position === 'right'
    ? 'fixed right-4 top-1/2 -translate-y-1/2 z-[5] space-y-2'
    : 'fixed left-4 top-1/2 -translate-y-1/2 z-[5] space-y-2';

  return (
    <div className={positionClass}>
      {countArray.map((item) => (
        <RewardCountItem
          key={item.rewardId}
          userNames={item.userNames}
          displayName={item.displayName}
          state={item.state}
          position={position}
        />
      ))}
    </div>
  );
};

export default RewardCountDisplay;
