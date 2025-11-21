import React from 'react';
import { RewardCountState } from '../types';

interface RewardCountItemProps {
  userNames: string[];
  displayName: string;
  state: RewardCountState;
  position: 'left' | 'right'; // 表示位置
}

export const RewardCountItem: React.FC<RewardCountItemProps> = ({
  userNames,
  displayName,
  state,
  position,
}) => {
  // アニメーション用のクラス（位置に応じて変更）
  const getStateClass = () => {
    const suffix = position === 'right' ? '-right' : '';
    switch (state) {
      case 'entering':
        return `reward-count-item-entering${suffix}`;
      case 'visible':
        return 'reward-count-item-visible';
      case 'exiting':
        return `reward-count-item-exiting${suffix}`;
      case 'hidden':
        return 'reward-count-item-hidden';
      default:
        return '';
    }
  };

  // ユーザー名を集約してカウント表示
  const aggregatedUsers = React.useMemo(() => {
    const countMap = new Map<string, number>();
    userNames.forEach(name => {
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });
    return Array.from(countMap.entries()).map(([name, count]) => ({
      name,
      count
    }));
  }, [userNames]);

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
              {aggregatedUsers.map((user, index) => (
                <div key={index} className="reward-count-user">
                  {user.count > 1 ? `${user.name} x${user.count}` : user.name}
                </div>
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
