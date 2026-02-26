import React, { useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { RewardCountItem } from './RewardCountItem';
import { useRewardCounts } from './reward-count/useRewardCounts';

const RewardCountDisplay: React.FC = () => {
  const { settings } = useSettings();
  const isEnabled = settings?.reward_count_enabled ?? false;
  const groupId = settings?.reward_count_group_id;
  const position = settings?.reward_count_position ?? 'left';

  const playAlertSound = useCallback(() => {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.5;
    audio.play().catch((err) => {
      console.error('Failed to play alert sound:', err);
    });
  }, []);

  const { countArray } = useRewardCounts({
    isEnabled,
    ...(groupId ? { groupId } : {}),
    playAlertSound,
  });

  if (!isEnabled) return null;

  const positionClass = position === 'right'
    ? 'fixed right-4 top-1/2 -translate-y-1/2 z-[5] space-y-2'
    : 'fixed left-4 top-1/2 -translate-y-1/2 z-[5] space-y-2';

  return (
    <div className={positionClass}>
      {countArray.map((item) => (
        <RewardCountItem
          key={item.rewardId}
          userNames={item.userNames}
          displayName={item.displayName}
          state={item.state}
          position={position}
        />
      ))}
    </div>
  );
};

export default RewardCountDisplay;
