import React from 'react';
import { RewardCountState } from '../types';

interface RewardCountItemProps {
  count: number;
  displayName: string;
  state: RewardCountState;
}

export const RewardCountItem: React.FC<RewardCountItemProps> = ({
  count,
  displayName,
  state,
}) => {
  // アニメーション用のクラス
  const getStateClass = () => {
    switch (state) {
      case 'entering':
        return 'reward-count-item-entering';
      case 'visible':
        return 'reward-count-item-visible';
      case 'exiting':
        return 'reward-count-item-exiting';
      case 'hidden':
        return 'reward-count-item-hidden';
      default:
        return '';
    }
  };

  return (
    <div className={`reward-count-item ${getStateClass()}`}>
      <div className="reward-count-content">
        <span className="reward-count-name">{displayName}</span>
        <span className="reward-count-value">x{count}</span>
      </div>
    </div>
  );
};
