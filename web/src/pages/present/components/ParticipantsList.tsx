import React from 'react';
import type { PresentParticipant } from '../PresentPage';

interface ParticipantsListProps {
  participants: PresentParticipant[];
  winner: PresentParticipant | null;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  winner,
}) => {
  // 総口数を計算（購入口数 + サブスクボーナス）
  const totalEntries = participants.reduce((sum, p) => {
    const baseCount = p.entry_count || 1;
    let bonusWeight = 0;
    if (p.is_subscriber && p.subscribed_months > 0) {
      // Tier係数を取得
      let tierMultiplier = 1.0;
      if (p.subscriber_tier === '3000') {
        tierMultiplier = 1.2;
      } else if (p.subscriber_tier === '2000') {
        tierMultiplier = 1.1;
      }

      // ボーナス計算（切り上げ）
      const bonusCalculation = (p.subscribed_months * tierMultiplier * 1.1) / 3;
      bonusWeight = Math.ceil(bonusCalculation);

      // 最低ボーナス：サブスク登録者は最低1口
      if (bonusWeight < 1) {
        bonusWeight = 1;
      }
    }
    return sum + baseCount + bonusWeight;
  }, 0);

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span>👥</span>
        <span>参加者一覧</span>
        <span className="ml-auto text-xl bg-purple-600 px-3 py-1 rounded-full">
          {participants.length}
        </span>
      </h2>
      <div className="text-sm text-purple-200 mb-3">
        総口数: <span className="font-bold text-yellow-300">{totalEntries}口</span>
      </div>

      {participants.length === 0 ? (
        <div className="text-center py-12 text-purple-300 flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">🎫</div>
          <p className="text-lg">まだ参加者がいません</p>
          <p className="text-sm mt-2">
            リワードを使用すると参加できます
          </p>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-purple-900">
          {participants.map((participant, index) => {
            const isWinner = winner?.user_id === participant.user_id;
            const redeemedAt = new Date(participant.redeemed_at);
            const timeAgo = getTimeAgo(redeemedAt);

            // 購入口数 + サブスクボーナス
            const baseCount = participant.entry_count || 1;
            let bonusWeight = 0;
            if (participant.is_subscriber && participant.subscribed_months > 0) {
              // Tier係数を取得
              let tierMultiplier = 1.0;
              if (participant.subscriber_tier === '3000') {
                tierMultiplier = 1.2;
              } else if (participant.subscriber_tier === '2000') {
                tierMultiplier = 1.1;
              }

              // ボーナス計算（切り上げ）
              const bonusCalculation = (participant.subscribed_months * tierMultiplier * 1.1) / 3;
              bonusWeight = Math.ceil(bonusCalculation);

              // 最低ボーナス：サブスク登録者は最低1口
              if (bonusWeight < 1) {
                bonusWeight = 1;
              }
            }
            const totalWeight = baseCount + bonusWeight;
            const winProbability = ((totalWeight / totalEntries) * 100).toFixed(1);

            return (
              <div
                key={participant.user_id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isWinner
                    ? 'bg-yellow-500/30 border-2 border-yellow-400 scale-105'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {/* 番号 */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold">
                  {index + 1}
                </div>

                {/* アバター */}
                {participant.avatar_url ? (
                  <img
                    src={participant.avatar_url}
                    alt={participant.display_name}
                    className="w-10 h-10 rounded-full border-2 border-purple-400"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-xl">
                    👤
                  </div>
                )}

                {/* 名前と時刻 */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {participant.display_name || participant.username}
                    {isWinner && <span className="text-yellow-400">👑</span>}
                    {participant.is_subscriber && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          participant.subscriber_tier === '3000'
                            ? 'bg-purple-600 text-white'
                            : participant.subscriber_tier === '2000'
                            ? 'bg-pink-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                        title={`サブスク${participant.subscribed_months}ヶ月`}
                      >
                        Tier {participant.subscriber_tier === '3000' ? '3' : participant.subscriber_tier === '2000' ? '2' : '1'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-purple-300">
                    {timeAgo}
                    {participant.is_subscriber && (
                      <span className="ml-2">
                        🌟 {participant.subscribed_months}ヶ月
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-yellow-300 font-bold mt-1">
                    🎫 {baseCount}口
                    {bonusWeight > 0 && (
                      <span className="text-pink-300"> +{bonusWeight}ボーナス</span>
                    )}
                    {' '}• 確率 {winProbability}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {participants.length > 0 && (
        <div className="mt-4 pt-4 border-t border-purple-400/30 text-sm text-purple-300">
          <p>💡 ルーレットを回して当選者を決定しよう！</p>
        </div>
      )}
    </div>
  );
};

// 時間経過を人間に読みやすい形式で返す
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'たった今';
  if (diffMinutes < 60) return `${diffMinutes}分前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}日前`;
}
