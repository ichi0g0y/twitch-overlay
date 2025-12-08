import React, { useState } from 'react';
import { buildApiUrl } from '../../../utils/api';

interface ControlPanelProps {
  participantCount: number;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
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

  return (
    <div className="bg-yellow-500/20 backdrop-blur-md rounded-2xl p-6 shadow-2xl border-2 border-yellow-400">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span>🔧</span>
        <span>デバッグ機能</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* テスト参加者追加 */}
        <button
          onClick={handleTestParticipants}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : 'テスト参加者追加'}
        </button>

        {/* 当選者決定 */}
        <button
          onClick={handleDraw}
          disabled={isLoading || participantCount === 0}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {isLoading ? '処理中...' : '当選者決定'}
        </button>
      </div>

      <div className="mt-4 text-sm text-yellow-200">
        <p>💡 テスト用の機能です。本番環境では使用しないでください。</p>
      </div>
    </div>
  );
};
