import React, { useMemo } from 'react';
import type { PresentParticipant } from '../pages/present/PresentPage';

interface ParticipantTickerProps {
  participants: PresentParticipant[];
  enabled: boolean;
}

export const ParticipantTicker: React.FC<ParticipantTickerProps> = ({
  participants,
  enabled,
}) => {
  // ティッカーアイテムのレンダリング
  const renderTickerItem = (participant: PresentParticipant, index: number) => {
    // サブスク状況に応じた装飾
    const isSubscriber = participant.is_subscriber;
    const subscriberTier = participant.subscriber_tier;

    // サブスク状況による背景色
    let bgColorClass = 'bg-purple-700/80';
    if (isSubscriber) {
      if (subscriberTier === '3000') {
        bgColorClass = 'bg-gradient-to-r from-purple-600 to-pink-600';
      } else if (subscriberTier === '2000') {
        bgColorClass = 'bg-gradient-to-r from-pink-600 to-purple-600';
      } else if (subscriberTier === '1000') {
        bgColorClass = 'bg-gradient-to-r from-blue-600 to-purple-600';
      }
    }

    // 口数計算（購入口数 + サブスクボーナス）
    const baseCount = participant.entry_count || 1;
    let bonusWeight = 0;
    if (isSubscriber) {
      if (subscriberTier === '3000') {
        bonusWeight = 12;
      } else if (subscriberTier === '2000') {
        bonusWeight = 6;
      } else if (subscriberTier === '1000') {
        bonusWeight = 3;
      }
    }
    const totalCount = baseCount + bonusWeight;

    return (
      <div
        key={`${participant.user_id}-${index}`}
        className={`inline-flex items-center gap-2 pl-2 pr-4 py-2 rounded-full ${bgColorClass} text-white font-flat shadow-lg`}
      >
        {/* アバター */}
        {participant.avatar_url ? (
          <img
            src={participant.avatar_url}
            alt={participant.display_name}
            className="w-8 h-8 rounded-full border-2 border-white flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center text-sm flex-shrink-0">
            👤
          </div>
        )}

        {/* 表示名 */}
        <span className="font-semibold text-lg max-w-[200px] truncate">
          {participant.display_name || participant.username}さん
        </span>

        {/* 口数表示 */}
        <span className="text-yellow-300 font-bold whitespace-nowrap flex-shrink-0">
          {bonusWeight > 0 ? `${baseCount}+${bonusWeight}口` : `${baseCount}口`}
        </span>

        {/* サブスクバッジ */}
        {isSubscriber && (
          <span className="text-xs px-2 py-0.5 rounded bg-white/20 whitespace-nowrap flex-shrink-0">
            Sub {subscriberTier === '3000' ? '3' : subscriberTier === '2000' ? '2' : '1'}
          </span>
        )}
      </div>
    );
  };

  // 参加者が複数回登場するリストを作成（seamlessループ用）
  const tickerContent = useMemo(() => {
    // 参加者が配列でない場合や空の場合は null を返す
    if (!Array.isArray(participants) || participants.length === 0) return null;

    // 参加者リストを2回繰り返し（無限スクロール実現）
    const duplicatedParticipants = [...participants, ...participants];

    return duplicatedParticipants.map((participant, index) =>
      renderTickerItem(participant, index)
    );
  }, [participants]);

  // アニメーション速度の計算（参加者数に応じて調整）
  const animationDuration = useMemo(() => {
    if (!Array.isArray(participants)) return 10;
    // 基本速度: 参加者1人あたり3秒
    const baseSpeed = participants.length * 3;
    // 最小10秒、最大60秒
    return Math.max(10, Math.min(60, baseSpeed));
  }, [participants]);

  if (!enabled || !Array.isArray(participants) || participants.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[10] overflow-hidden bg-gradient-to-t from-purple-900/90 to-transparent backdrop-blur-sm py-3">
      <div
        className="flex gap-2 whitespace-nowrap participant-ticker-scroll"
        style={{
          animationDuration: `${animationDuration}s`,
        }}
      >
        {tickerContent}
      </div>
    </div>
  );
};
