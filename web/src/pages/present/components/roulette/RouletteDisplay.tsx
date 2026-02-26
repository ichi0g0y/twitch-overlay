import React from 'react';
import type { PresentParticipant } from '../../../../types';

interface RouletteDisplayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  participants: PresentParticipant[];
  isStopped: boolean;
  isIdle: boolean;
  currentArrowUser: PresentParticipant | null;
  displayWinner: PresentParticipant | null;
}

export const RouletteDisplay: React.FC<RouletteDisplayProps> = ({
  canvasRef,
  participants,
  isStopped,
  isIdle,
  currentArrowUser,
  displayWinner,
}) => {
  if (isStopped && displayWinner) {
    return (
      <div className='flex items-center justify-center' style={{ height: '800px' }}>
        <div className='animate-bounce flex flex-col items-center'>
          <div className='text-5xl font-bold text-yellow-300 mb-8 text-center'>🎉 当選者 🎉</div>
          <div className='flex flex-col items-center gap-6'>
            <img
              src={
                displayWinner.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  displayWinner.display_name || displayWinner.username
                )}&size=192&background=random`
              }
              alt={displayWinner.display_name || displayWinner.username}
              className='w-48 h-48 rounded-full border-8 border-yellow-300 shadow-2xl'
            />
            <div className='text-6xl font-bold text-white leading-tight text-center'>
              {displayWinner.display_name || displayWinner.username}さん
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className='text-center mb-4 min-h-36 flex items-center justify-center'>
        {isIdle ? (
          <div className='flex flex-col items-center gap-2'>
            <div className='text-2xl font-bold text-yellow-300'>現在の参加者は {participants.length} 名です</div>
            <div className='text-xl text-purple-200'>ご参加ありがとうございます</div>
          </div>
        ) : currentArrowUser ? (
          <div className='flex flex-col items-center gap-2'>
            <img
              src={
                currentArrowUser.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  currentArrowUser.display_name || currentArrowUser.username
                )}&size=64&background=random`
              }
              alt={currentArrowUser.display_name || currentArrowUser.username}
              className='w-16 h-16 rounded-full border-2 border-yellow-300'
            />
            <div className='text-3xl font-bold text-yellow-300'>
              {currentArrowUser.display_name || currentArrowUser.username}さん
            </div>
          </div>
        ) : null}
      </div>

      <div className='flex flex-col items-center justify-center'>
        <canvas ref={canvasRef} width={600} height={600} className='max-w-full h-auto' />
      </div>
    </>
  );
};
