import React, { useState, useEffect } from 'react';
import { Play, Square, Trash2 } from 'lucide-react';
import { RouletteWheel } from './components/RouletteWheel';
import { ParticipantsList } from './components/ParticipantsList';
import { useWebSocket } from '../../hooks/useWebSocket';
import { buildApiUrl } from '../../utils/api';

export interface PresentParticipant {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  redeemed_at: string;
  is_subscriber: boolean;
  subscribed_months: number;
  subscriber_tier: string; // "1000", "2000", "3000"
  entry_count: number; // 購入口数（最大3口）
}

interface LotteryState {
  enabled: boolean;
  is_running: boolean;
  participants: PresentParticipant[];
  winner: PresentParticipant | null;
}

export const PresentPage: React.FC = () => {
  const [lotteryState, setLotteryState] = useState<LotteryState>({
    enabled: false,
    is_running: false,
    participants: [],
    winner: null,
  });
  const [isSpinning, setIsSpinning] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // ルーレット停止完了時のコールバック
  const handleSpinComplete = (winner: PresentParticipant) => {
    console.log('Spin complete, winner:', winner);
    setLotteryState((prev) => ({
      ...prev,
      winner,
      is_running: false,
    }));
  };

  // 抽選開始
  const handleStart = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/start'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start lottery');
      }
    } catch (error) {
      console.error('Error starting lottery:', error);
      alert('抽選の開始に失敗しました');
    }
  };

  // 抽選停止
  const handleStop = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/stop'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to stop lottery');
      }
    } catch (error) {
      console.error('Error stopping lottery:', error);
      alert('抽選の停止に失敗しました');
    }
  };

  // 参加者クリア
  const handleClear = async () => {
    if (!confirm('参加者リストをクリアしますか？この操作は取り消せません。')) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/present/clear'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to clear participants');
      }
    } catch (error) {
      console.error('Error clearing participants:', error);
      alert('参加者リストのクリアに失敗しました');
    }
  };

  // URLパラメータからデバッグモードを判定
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get('debug') === 'true');
  }, []);

  // ページタイトルを設定
  useEffect(() => {
    document.title = 'プレゼントルーレット - Twitch Overlay';
    return () => {
      document.title = 'Twitch Overlay';
    };
  }, []);

  // WebSocket接続
  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      console.log('WebSocket message received:', message);

      switch (message.type) {
        case 'lottery_participant_added':
          setLotteryState((prev) => ({
            ...prev,
            participants: [...prev.participants, message.data],
          }));
          break;

        case 'lottery_participants_updated':
          setLotteryState((prev) => ({
            ...prev,
            participants: message.data,
          }));
          break;

        case 'lottery_started':
          setLotteryState((prev) => ({
            ...prev,
            is_running: true,
            winner: null,  // 抽選開始時に当選者をクリア
          }));
          setIsSpinning(true);
          break;

        case 'lottery_stopped':
          setLotteryState((prev) => ({ ...prev, is_running: false }));
          setIsSpinning(false);
          // winnerはルーレット停止後にフロントエンドで決定される
          break;

        case 'lottery_winner':
          // バックエンドからの当選者通知でルーレットを停止
          // winner と winner_index を受け取る
          setLotteryState((prev) => ({
            ...prev,
            is_running: false,
            winner: message.data.winner
          }));
          setIsSpinning(false);
          console.log('Winner from backend:', message.data.winner, 'index:', message.data.winner_index);
          break;

        case 'lottery_participants_cleared':
          setLotteryState((prev) => ({
            ...prev,
            participants: [],
            winner: null,
          }));
          break;
      }
    },
  });

  // 初回ロード時に参加者リストを取得
  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/present/participants'));
        if (response.ok) {
          const data = await response.json();
          setLotteryState({
            enabled: data.enabled,
            is_running: data.is_running,
            participants: data.participants || [],
            winner: data.winner || null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch participants:', error);
      }
    };

    fetchParticipants();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2">🎁 プレゼントルーレット 🎁</h1>
          <p className="text-xl text-purple-200">
            リワードを使用した参加者の中から抽選！
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className={`flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
              <span>{isConnected ? '接続中' : '切断'}</span>
            </div>
            {debugMode && (
              <div className="flex items-center gap-2 text-yellow-400">
                <span>🔧 デバッグモード</span>
              </div>
            )}
            {!lotteryState.enabled && (
              <div className="flex items-center gap-2 text-yellow-400">
                <span>⚠ 抽選機能無効</span>
              </div>
            )}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左側：ルーレットとコントロール */}
          <div className="lg:col-span-2 space-y-4">
            {/* ルーレット */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl h-[800px] flex items-center justify-center">
              <RouletteWheel
                participants={lotteryState.participants}
                isSpinning={isSpinning}
                onSpinComplete={handleSpinComplete}
              />
            </div>

            {/* コントロールボタン */}
            <div className="bg-purple-500/20 backdrop-blur-md rounded-2xl p-6 shadow-2xl border-2 border-purple-400">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleStart}
                  disabled={lotteryState.participants.length === 0 || lotteryState.is_running}
                  className="flex items-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold text-lg transition-colors disabled:cursor-not-allowed"
                >
                  <Play size={24} />
                  抽選開始
                </button>

                <button
                  onClick={handleStop}
                  disabled={!lotteryState.is_running}
                  className="flex items-center gap-2 px-8 py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded-lg font-semibold text-lg transition-colors disabled:cursor-not-allowed"
                >
                  <Square size={24} />
                  停止
                </button>

                <button
                  onClick={handleClear}
                  disabled={lotteryState.participants.length === 0}
                  className="flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg font-semibold text-lg transition-colors disabled:cursor-not-allowed"
                >
                  <Trash2 size={24} />
                  クリア
                </button>
              </div>
            </div>
          </div>

          {/* 右側：参加者リスト */}
          <div className="lg:col-span-1 h-[800px]">
            <ParticipantsList
              participants={lotteryState.participants}
              winner={lotteryState.winner}
              debugMode={debugMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
