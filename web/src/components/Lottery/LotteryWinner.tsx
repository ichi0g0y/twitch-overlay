import React, { useEffect, useState } from 'react';
import Confetti from 'react-confetti';
import { playFanfareSound } from '../../utils/sound';
import type { LotteryWinnerProps } from './types';

const resolveWindowSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export const LotteryWinner: React.FC<LotteryWinnerProps> = ({ winner }) => {
  const [windowSize, setWindowSize] = useState(resolveWindowSize);

  useEffect(() => {
    const onResize = () => {
      setWindowSize(resolveWindowSize());
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    playFanfareSound();
  }, [winner.user_id]);

  const winnerName = winner.display_name || winner.username;
  const avatarUrl =
    winner.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(winnerName)}&size=192&background=1f2937&color=ffffff`;

  return (
    <div className="lottery-overlay-panel lottery-winner-entering">
      <Confetti
        width={windowSize.width}
        height={windowSize.height}
        recycle={true}
        numberOfPieces={420}
      />
      <div className="lottery-winner-card">
        <div className="lottery-winner-title">WINNER</div>
        <img
          src={avatarUrl}
          alt={winnerName}
          className="lottery-winner-avatar"
        />
        <div className="lottery-winner-name">{winnerName} さん</div>
      </div>
    </div>
  );
};
