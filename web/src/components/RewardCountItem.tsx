import React from 'react';
import { RewardCountState } from '../types';

interface RewardCountItemProps {
  userNames: string[];
  displayName: string;
  state: RewardCountState;
}

export const RewardCountItem: React.FC<RewardCountItemProps> = ({
  userNames,
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
    <div className={`font-flat reward-count-item ${getStateClass()}`}>
      {/* 3x3グリッドでドット絵風のボーダーを作成 */}
      <div className="reward-count-grid">
        {/* 上段 */}
        <div className="reward-count-corner" /> {/* 左上：透明 */}
        <div className="reward-count-border-h" /> {/* 上：白 */}
        <div className="reward-count-corner" /> {/* 右上：透明 */}

        {/* 中段 */}
        <div className="reward-count-border-v" /> {/* 左：白 */}
        <div className="reward-count-content-container"> {/* 中央：黒背景 + コンテンツ */}
          <div className="reward-count-content">
            <div className="reward-count-header">{displayName}</div>
            <div className="reward-count-users">
              {userNames.map((userName, index) => (
                <div key={index} className="reward-count-user">{userName}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="reward-count-border-v" /> {/* 右：白 */}

        {/* 下段 */}
        <div className="reward-count-corner" /> {/* 左下：透明 */}
        <div className="reward-count-border-h" /> {/* 下：白 */}
        <div className="reward-count-corner" /> {/* 右下：透明 */}
      </div>
    </div>
  );
};
