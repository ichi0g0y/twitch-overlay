import React, { useState } from 'react';
import { buildApiUrl } from '../../../utils/api';

interface ControlPanelProps {
  isRunning: boolean;
  participantCount: number;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning,
  participantCount,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleTestParticipants = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/present/test'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to add test participants');
      }

      const data = await response.json();
      console.log('Test participants added:', data);
    } catch (error) {
      console.error('Error adding test participants:', error);
      alert('テスト参加者の追加に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleDraw = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/present/draw'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to draw winner');
      }

      const data = await response.json();
      console.log('Winner drawn:', data);
    } catch (error) {
      console.error('Error drawing winner:', error);
      alert('抽選の実行に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('参加者リストをクリアしますか？この操作は取り消せません。')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/present/clear'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to clear participants');
      }

      console.log('Participants cleared');
    } catch (error) {
      console.error('Error clearing participants:', error);
      alert('参加者リストのクリアに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-yellow-500/20 backdrop-blur-md rounded-2xl p-6 shadow-2xl border-2 border-yellow-400">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span>🔧</span>
        <span>デバッグコントロールパネル</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* テスト参加者追加 */}
        <button
          onClick={handleTestParticipants}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : 'テスト参加者追加'}
        </button>

        {/* 抽選開始 */}
        <button
          onClick={handleStart}
          disabled={isLoading || participantCount === 0 || isRunning}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : '抽選開始'}
        </button>

        {/* 抽選停止 */}
        <button
          onClick={handleStop}
          disabled={isLoading || !isRunning}
          className="px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : '抽選停止'}
        </button>

        {/* 抽選実行（当選者決定） */}
        <button
          onClick={handleDraw}
          disabled={isLoading || participantCount === 0}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : '当選者決定'}
        </button>

        {/* 参加者クリア */}
        <button
          onClick={handleClear}
          disabled={isLoading || participantCount === 0}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : '参加者クリア'}
        </button>
      </div>

      <div className="mt-4 p-4 bg-black/30 rounded-lg">
        <h3 className="font-bold mb-2">ステータス</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>参加者数: <span className="font-bold">{participantCount}</span></div>
          <div>抽選状態: <span className="font-bold">{isRunning ? '実行中' : '停止中'}</span></div>
        </div>
      </div>

      <div className="mt-4 text-sm text-yellow-200">
        <p>⚠️ このパネルはデバッグモード（?debug=true）でのみ表示されます</p>
      </div>
    </div>
  );
};
