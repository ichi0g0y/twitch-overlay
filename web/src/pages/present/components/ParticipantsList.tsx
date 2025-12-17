import React, { useState } from 'react';
import { Edit2, Save, X, Trash2 } from 'lucide-react';
import type { PresentParticipant } from '../PresentPage';
import { buildApiUrl } from '../../../utils/api';

interface ParticipantsListProps {
  participants: PresentParticipant[];
  winner: PresentParticipant | null;
  debugMode?: boolean;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  winner,
  debugMode = false,
}) => {
  // デバッグ: participants の変更を追跡
  console.log('[ParticipantsList] Rendering with participants:', participants.map(p => ({
    user_id: p.user_id,
    username: p.username,
    entry_count: p.entry_count
  })));

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PresentParticipant>>({});
  // 総口数を計算（購入口数 + サブスクボーナス）
  const totalEntries = participants.reduce((sum, p) => {
    const baseCount = p.entry_count || 1;
    let bonusWeight = 0;
    if (p.is_subscriber) {
      // Tier のみでボーナス計算（案B：サブスク優遇型）
      if (p.subscriber_tier === '3000') {
        bonusWeight = 12;
      } else if (p.subscriber_tier === '2000') {
        bonusWeight = 6;
      } else if (p.subscriber_tier === '1000') {
        bonusWeight = 3;
      }
    }
    return sum + baseCount + bonusWeight;
  }, 0);

  // テスト参加者追加
  const handleAddTestParticipant = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/test'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to add test participant');
      }
    } catch (error) {
      console.error('Error adding test participant:', error);
      alert('テスト参加者の追加に失敗しました');
    }
  };

  // 参加者削除
  const handleDeleteParticipant = async (userId: string) => {
    if (!confirm('この参加者を削除しますか？')) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/present/participants/${userId}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete participant');
      }
    } catch (error) {
      console.error('Error deleting participant:', error);
      alert('参加者の削除に失敗しました');
    }
  };

  // 編集開始
  const handleStartEdit = (participant: PresentParticipant) => {
    setEditingUserId(participant.user_id);
    setEditForm({
      entry_count: participant.entry_count,
      is_subscriber: participant.is_subscriber,
      subscriber_tier: participant.subscriber_tier,
    });
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditForm({});
  };

  // 編集保存
  const handleSaveEdit = async (userId: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/present/participants/${userId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update participant');
      }
      setEditingUserId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating participant:', error);
      alert('参加者の更新に失敗しました');
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span>👥</span>
        <span>参加者一覧</span>
        <span className="ml-auto text-xl bg-purple-600 px-3 py-1 rounded-full">
          {participants.length}
        </span>
        {debugMode && (
          <button
            onClick={handleAddTestParticipant}
            className="ml-2 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors"
            title="テスト参加者を追加"
          >
            +
          </button>
        )}
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
            console.log(`[ParticipantsList] User ${participant.username}: entry_count=${participant.entry_count}, baseCount=${baseCount}`);
            let bonusWeight = 0;
            if (participant.is_subscriber) {
              // Tier のみでボーナス計算（案B：サブスク優遇型）
              if (participant.subscriber_tier === '3000') {
                bonusWeight = 12;
              } else if (participant.subscriber_tier === '2000') {
                bonusWeight = 6;
              } else if (participant.subscriber_tier === '1000') {
                bonusWeight = 3;
              }
            }
            const totalWeight = baseCount + bonusWeight;
            const winProbability = ((totalWeight / totalEntries) * 100).toFixed(1);
            const isEditing = editingUserId === participant.user_id;

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

                {/* 名前と情報 */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    // 編集モード
                    <div className="space-y-2">
                      <div className="font-semibold">
                        {participant.display_name || participant.username}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="flex items-center gap-1">
                          口数:
                          <input
                            type="number"
                            min="1"
                            max="3"
                            value={editForm.entry_count || 1}
                            onChange={(e) => setEditForm({ ...editForm, entry_count: parseInt(e.target.value) })}
                            className="w-16 px-1 py-0.5 bg-black/30 rounded"
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editForm.is_subscriber || false}
                            onChange={(e) => setEditForm({ ...editForm, is_subscriber: e.target.checked })}
                          />
                          サブスク
                        </label>
                        {editForm.is_subscriber && (
                          <label className="flex items-center gap-1">
                            Tier:
                            <select
                              value={editForm.subscriber_tier || '1000'}
                              onChange={(e) => setEditForm({ ...editForm, subscriber_tier: e.target.value })}
                              className="px-1 py-0.5 bg-black/30 rounded"
                            >
                              <option value="1000">1</option>
                              <option value="2000">2</option>
                              <option value="3000">3</option>
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  ) : (
                    // 通常表示
                    <>
                      <div className="font-semibold truncate flex items-center gap-2">
                        {participant.display_name || participant.username}
                        {isWinner && <span className="text-yellow-400">👑</span>}
                      </div>
                      <div className="text-xs text-purple-300 flex items-center gap-2 mt-1">
                        {participant.is_subscriber && (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded ${
                                participant.subscriber_tier === '3000'
                                  ? 'bg-purple-600 text-white'
                                  : participant.subscriber_tier === '2000'
                                  ? 'bg-pink-600 text-white'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              Tier {participant.subscriber_tier === '3000' ? '3' : participant.subscriber_tier === '2000' ? '2' : '1'}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{timeAgo}</span>
                      </div>
                      <div className="text-xs text-yellow-300 font-bold mt-1">
                        🎫 {baseCount}口
                        {bonusWeight > 0 && (
                          <span className="text-pink-300"> +{bonusWeight}ボーナス</span>
                        )}
                        {' '}• 確率 {winProbability}%
                      </div>
                    </>
                  )}
                </div>

                {/* デバッグモード時の操作ボタン */}
                {debugMode && (
                  <div className="flex flex-col gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(participant.user_id)}
                          className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
                          title="保存"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                          title="キャンセル"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(participant)}
                          className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                          title="編集"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteParticipant(participant.user_id)}
                          className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
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
