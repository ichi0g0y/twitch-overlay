import React, { useState, useEffect } from 'react';
import { RouletteWheel } from './components/RouletteWheel';
import { ParticipantsList } from './components/ParticipantsList';
import { ControlPanel } from './components/ControlPanel';
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
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左側：ルーレット */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl h-[800px] flex items-center justify-center">
              <RouletteWheel
                participants={lotteryState.participants}
                isSpinning={isSpinning}
                onSpinComplete={handleSpinComplete}
              />
            </div>
          </div>

          {/* 右側：参加者リスト */}
          <div className="lg:col-span-1 h-[800px]">
            <ParticipantsList
              participants={lotteryState.participants}
              winner={lotteryState.winner}
            />
          </div>
        </div>

        {/* コントロールパネル */}
        <div className="mt-8">
          <ControlPanel
            isRunning={lotteryState.is_running}
            participantCount={lotteryState.participants.length}
          />
        </div>

        {/* フッター */}
        <div className="text-center mt-8 text-purple-300">
          <p className="text-sm">
            {lotteryState.enabled ? (
              <span className="text-green-400">✓ 抽選機能は有効です</span>
            ) : (
              <span className="text-yellow-400">⚠ 抽選機能は無効です（設定画面で有効にしてください）</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
