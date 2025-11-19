import React, { useEffect, useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { getWebSocketClient } from '../utils/websocket';
import { buildApiUrl } from '../utils/api';
import { RewardCount, RewardCountItemState } from '../types';
import { RewardCountItem } from './RewardCountItem';

const RewardCountDisplay: React.FC = () => {
  const { settings } = useSettings();
  const [counts, setCounts] = useState<Map<string, RewardCountItemState>>(new Map());
  const [groupRewardIds, setGroupRewardIds] = useState<Set<string>>(new Set());

  // 設定が有効かチェック
  const isEnabled = settings?.reward_count_enabled ?? false;
  const groupId = settings?.reward_count_group_id;

  // アラート音声を再生する関数
  const playAlertSound = useCallback(() => {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.5; // 音量を50%に設定
    audio.play().catch((err) => {
      console.error('Failed to play alert sound:', err);
    });
  }, []);

  // グループのリワードIDリストを取得
  useEffect(() => {
    if (!isEnabled || !groupId) {
      setGroupRewardIds(new Set());
      return;
    }

    const fetchGroupRewardIds = async () => {
      try {
        const url = buildApiUrl(`/api/twitch/reward-groups/${groupId}`);
        const response = await fetch(url);
        if (response.ok) {
          const group = await response.json();
          setGroupRewardIds(new Set(group.reward_ids || []));
        }
      } catch (error) {
        console.error('Failed to fetch group reward IDs:', error);
        setGroupRewardIds(new Set());
      }
    };

    fetchGroupRewardIds();
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
                state: 'visible',
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
      console.log('Current groupId:', groupId);
      console.log('Current groupRewardIds:', Array.from(groupRewardIds));
      console.log('Received reward_id:', data.reward_id);

      // グループフィルタが有効な場合、グループに属するリワードかチェック
      if (groupId && groupRewardIds.size > 0 && !groupRewardIds.has(data.reward_id)) {
        console.log('❌ Ignoring reward: not in selected group', data.reward_id);
        return;
      }
      console.log('✅ Processing reward:', data.reward_id);

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
            // entering状態を visible に変更
            setTimeout(() => {
              setCounts((current) => {
                const updated = new Map(current);
                const item = updated.get(data.reward_id);
                if (item && item.state === 'entering') {
                  updated.set(data.reward_id, { ...item, state: 'visible' });
                }
                return updated;
              });
            }, 50);
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
  }, [isEnabled, groupId, groupRewardIds, playAlertSound]);

  if (!isEnabled) {
    return null;
  }

  // カウントを配列に変換してソート（更新時刻の新しい順）
  const countArray = Array.from(counts.values()).sort((a, b) => {
    // 常に最新の更新を上に表示
    return 0; // 挿入順を維持（Mapは挿入順を保持）
  });

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[5] space-y-2">
      {countArray.map((item) => (
        <RewardCountItem
          key={item.rewardId}
          userNames={item.userNames}
          displayName={item.displayName}
          state={item.state}
        />
      ))}
    </div>
  );
};

export default RewardCountDisplay;
