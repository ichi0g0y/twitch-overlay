import { Lock, LockOpen, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import React from 'react';
import Confetti from 'react-confetti';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import type { PresentParticipant } from '../../types';
import { ParticipantsList } from './components/ParticipantsList';
import { RouletteWheel } from './components/RouletteWheel';
import { usePresentLotteryController } from './hooks/usePresentLotteryController';

export const PresentPage: React.FC = () => {
  const {
    lotteryState,
    isSpinning,
    debugMode,
    showConfetti,
    showClearDialog,
    isRefreshing,
    refreshWarning,
    isConnected,
    setShowClearDialog,
    handleStart,
    handleStop,
    handleConfirmClear,
    handleLock,
    handleUnlock,
    handleRefreshSubscribers,
  } = usePresentLotteryController();

  const handleSpinComplete = (winner: PresentParticipant) => {
    console.log('Spin complete (local fallback), winner:', winner);
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white font-flat'>
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={true}
          numberOfPieces={500}
        />
      )}

      {showClearDialog && (
        <ConfirmDialog
          isOpen={showClearDialog}
          onClose={() => setShowClearDialog(false)}
          onConfirm={handleConfirmClear}
          title='参加者リストのクリア'
          message='参加者リストをクリアしますか？'
          confirmText='クリア'
          cancelText='キャンセル'
        />
      )}

      <div className='container mx-auto px-4 py-8'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
          <div className='lg:col-span-2'>
            <div className='bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl h-[800px] flex items-center justify-center'>
              <RouletteWheel
                participants={lotteryState.participants}
                isSpinning={isSpinning}
                baseTicketsLimit={lotteryState.base_tickets_limit}
                finalTicketsLimit={lotteryState.final_tickets_limit}
                winner={lotteryState.winner}
                onSpinComplete={handleSpinComplete}
              />
            </div>
          </div>

          <div className='lg:col-span-1 flex flex-col gap-4 h-[800px]'>
            <div className='bg-purple-500/20 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-purple-400'>
              {refreshWarning && (
                <div className='mb-3 rounded-md border border-yellow-400/60 bg-yellow-500/20 p-2 text-xs text-yellow-100'>
                  {refreshWarning}
                </div>
              )}
              <div className='flex gap-3 justify-center items-center'>
                <button
                  onClick={lotteryState.is_locked ? handleUnlock : handleLock}
                  className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                    lotteryState.is_locked ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                  title={lotteryState.is_locked ? 'ロック解除' : 'ロック'}
                >
                  {lotteryState.is_locked ? <Lock size={24} /> : <LockOpen size={24} />}
                </button>

                <button
                  onClick={handleStart}
                  disabled={lotteryState.participants.length === 0 || lotteryState.is_running}
                  className='flex items-center justify-center w-12 h-12 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed'
                  title='抽選開始'
                >
                  <Play size={24} />
                </button>

                <button
                  onClick={handleStop}
                  disabled={!lotteryState.is_running}
                  className='flex items-center justify-center w-12 h-12 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed'
                  title='停止'
                >
                  <Square size={24} />
                </button>

                <button
                  onClick={handleRefreshSubscribers}
                  disabled={lotteryState.participants.length === 0 || isRefreshing}
                  className='flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed'
                  title='全参加者のサブスク状況を更新'
                >
                  <RefreshCw size={24} className={isRefreshing ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => setShowClearDialog(true)}
                  disabled={lotteryState.participants.length === 0}
                  className='flex items-center justify-center w-12 h-12 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed'
                  title='クリア'
                >
                  <Trash2 size={24} />
                </button>

                <div className='flex items-center gap-2 ml-2'>
                  <div
                    className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
                    title={isConnected ? '接続中' : '切断'}
                  />
                </div>
              </div>
            </div>

            <div className='flex-1 min-h-0'>
              <ParticipantsList
                participants={lotteryState.participants}
                winner={lotteryState.winner}
                baseTicketsLimit={lotteryState.base_tickets_limit}
                finalTicketsLimit={lotteryState.final_tickets_limit}
                debugMode={debugMode}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
