import { useEffect, useState } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import type { PresentParticipant } from '../../../types';
import { buildApiUrl } from '../../../utils/api';

interface LotteryState {
  enabled: boolean;
  is_running: boolean;
  is_locked: boolean;
  base_tickets_limit: number;
  final_tickets_limit: number;
  participants: PresentParticipant[];
  winner: PresentParticipant | null;
}

export const usePresentLotteryController = () => {
  const [lotteryState, setLotteryState] = useState<LotteryState>({
    enabled: false,
    is_running: false,
    is_locked: false,
    base_tickets_limit: 3,
    final_tickets_limit: 0,
    participants: [],
    winner: null,
  });
  const [isSpinning, setIsSpinning] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const handleStart = async () => {
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
    }
  };

  const handleStop = async () => {
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
    }
  };

  const handleConfirmClear = async () => {
    setShowClearDialog(false);

    try {
      const response = await fetch(buildApiUrl('/api/present/clear'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to clear participants');
      }
    } catch (error) {
      console.error('Error clearing participants:', error);
      alert('参加者リストのクリアに失敗しました');
    }
  };

  const handleLock = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/lock'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to lock lottery');
      }

      setLotteryState((prev) => ({
        ...prev,
        is_locked: true,
      }));
    } catch (error) {
      console.error('Error locking lottery:', error);
      alert('ロックに失敗しました');
    }
  };

  const handleUnlock = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/unlock'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to unlock lottery');
      }

      setLotteryState((prev) => ({
        ...prev,
        is_locked: false,
      }));
    } catch (error) {
      console.error('Error unlocking lottery:', error);
      alert('ロック解除に失敗しました');
    }
  };

  const handleRefreshSubscribers = async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch(buildApiUrl('/api/present/refresh-subscribers'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to refresh subscriber status');
      }

      const result = await response.json();
      const failedUsers: string[] = Array.isArray(result.failed_users)
        ? result.failed_users.filter((name: unknown) => typeof name === 'string')
        : [];

      if (failedUsers.length > 0) {
        setRefreshWarning(
          `一部ユーザーのサブスク情報取得に失敗しました（${failedUsers.length}人）: ${failedUsers.join(', ')}`
        );
      } else {
        setRefreshWarning(null);
      }
    } catch (error) {
      console.error('Error refreshing subscriber status:', error);
      alert('サブスク状況の更新に失敗しました');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get('debug') === 'true');
  }, []);

  useEffect(() => {
    document.title = 'プレゼントルーレット - Twitch Overlay';
    return () => {
      document.title = 'Twitch Overlay';
    };
  }, []);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      switch (message.type) {
        case 'lottery_participant_added':
          setLotteryState((prev) => {
            const existingIndex = prev.participants.findIndex((p) => p.user_id === message.data.user_id);
            if (existingIndex >= 0) {
              const updatedParticipants = [...prev.participants];
              updatedParticipants[existingIndex] = message.data;
              return {
                ...prev,
                participants: updatedParticipants,
              };
            }

            return {
              ...prev,
              participants: [...prev.participants, message.data],
            };
          });
          break;

        case 'lottery_participants_updated':
          if (Array.isArray(message.data)) {
            setLotteryState((prev) => ({
              ...prev,
              participants: message.data,
            }));
          } else {
            setLotteryState((prev) => ({
              ...prev,
              participants: message.data?.participants || [],
              base_tickets_limit: message.data?.base_tickets_limit ?? prev.base_tickets_limit,
              final_tickets_limit: message.data?.final_tickets_limit ?? prev.final_tickets_limit,
            }));
          }
          break;

        case 'lottery_started':
          setLotteryState((prev) => ({
            ...prev,
            is_running: true,
            winner: null,
          }));
          setIsSpinning(true);
          setShowConfetti(false);
          break;

        case 'lottery_stopped':
          setLotteryState((prev) => ({ ...prev, is_running: false }));
          setIsSpinning(false);
          break;

        case 'lottery_winner':
          setTimeout(() => {
            setLotteryState((prev) => ({
              ...prev,
              is_running: false,
              winner: message.data.winner,
            }));
            setIsSpinning(false);
            setShowConfetti(true);
          }, 2000);
          break;

        case 'lottery_participants_cleared':
          setLotteryState((prev) => ({
            ...prev,
            participants: [],
            winner: null,
          }));
          setShowConfetti(false);
          break;

        case 'lottery_locked':
          setLotteryState((prev) => ({ ...prev, is_locked: true }));
          break;

        case 'lottery_unlocked':
          setLotteryState((prev) => ({ ...prev, is_locked: false }));
          break;
      }
    },
  });

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/present/participants'));
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setLotteryState({
          enabled: data.enabled,
          is_running: data.is_running,
          is_locked: data.is_locked || false,
          base_tickets_limit: data.base_tickets_limit ?? 3,
          final_tickets_limit: data.final_tickets_limit ?? 0,
          participants: data.participants || [],
          winner: data.winner || null,
        });
      } catch (error) {
        console.error('Failed to fetch participants:', error);
      }
    };

    fetchParticipants();
  }, []);

  return {
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
  };
};
