import { useEffect, useState } from 'react';

import { buildApiUrl } from '../../../utils/api';
import type { LotteryHistoryItem, LotteryRuntimeState, LotterySettingsState } from '../lottery/types';
import {
  executeDeleteLotteryHistory,
  executeLotteryDraw,
  executeLotteryResetWinner,
  executeRefreshSubscribers,
  executeSaveLotteryLimits,
} from './lotteryActions';

interface UseOverlayLotteryParams {
  isAuthenticated: boolean;
}

export const useOverlayLottery = ({
  isAuthenticated,
}: UseOverlayLotteryParams) => {
  const [customRewards, setCustomRewards] = useState<Array<{ id: string; title: string; cost: number }>>([]);
  const [lotterySettingsState, setLotterySettingsState] = useState<LotterySettingsState | null>(null);
  const [lotteryHistory, setLotteryHistory] = useState<LotteryHistoryItem[]>([]);
  const [lotteryRuntimeState, setLotteryRuntimeState] = useState<LotteryRuntimeState>({
    is_running: false,
    participants_count: 0,
  });
  const [lotteryBaseLimitInput, setLotteryBaseLimitInput] = useState<number>(3);
  const [lotteryFinalLimitInput, setLotteryFinalLimitInput] = useState<number>(0);
  const [isLotteryLoading, setIsLotteryLoading] = useState(false);
  const [isLotteryDrawing, setIsLotteryDrawing] = useState(false);
  const [isLotterySaving, setIsLotterySaving] = useState(false);
  const [isLotteryResettingWinner, setIsLotteryResettingWinner] = useState(false);
  const [isRefreshingSubscribers, setIsRefreshingSubscribers] = useState(false);
  const [subscriberWarning, setSubscriberWarning] = useState<string | null>(null);
  const [lotteryStatusMessage, setLotteryStatusMessage] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      setCustomRewards([]);
      return;
    }

    const fetchCustomRewards = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/twitch/custom-rewards'));
        if (response.ok) {
          const data = await response.json();
          setCustomRewards(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch custom rewards:', error);
      }
    };

    fetchCustomRewards();
  }, [isAuthenticated]);

  const readResponseError = async (response: Response): Promise<string> => {
    const fallback = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (!text) return fallback;
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string; detail?: string };
        const detail = parsed.error || parsed.message || parsed.detail;
        return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}: ${text}`;
      } catch {
        return `HTTP ${response.status}: ${text}`;
      }
    } catch {
      return fallback;
    }
  };

  const fetchLotterySettings = async () => {
    const response = await fetch(buildApiUrl('/api/lottery/settings'));
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    const data: LotterySettingsState = await response.json();
    setLotterySettingsState(data);
    setLotteryBaseLimitInput(data.base_tickets_limit ?? 3);
    setLotteryFinalLimitInput(data.final_tickets_limit ?? 0);
  };

  const fetchLotteryHistory = async (limit = 20) => {
    const response = await fetch(buildApiUrl(`/api/lottery/history?limit=${limit}`));
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    const data = await response.json() as { history?: LotteryHistoryItem[] };
    setLotteryHistory(data.history || []);
  };

  const fetchLotteryRuntimeState = async () => {
    const response = await fetch(buildApiUrl('/api/present/participants'));
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    const data = await response.json() as { is_running?: boolean; participants?: unknown[] };
    setLotteryRuntimeState({
      is_running: Boolean(data.is_running),
      participants_count: Array.isArray(data.participants) ? data.participants.length : 0,
    });
  };

  const fetchLotteryOverview = async () => {
    setIsLotteryLoading(true);
    try {
      await Promise.all([
        fetchLotterySettings(),
        fetchLotteryHistory(20),
        fetchLotteryRuntimeState(),
      ]);
      setLotteryStatusMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLotteryStatusMessage(`抽選情報の取得に失敗しました: ${message}`);
    } finally {
      setIsLotteryLoading(false);
    }
  };

  useEffect(() => {
    fetchLotteryOverview();
  }, []);

  useEffect(() => {
    let unsubStarted: (() => void) | null = null;
    let unsubStopped: (() => void) | null = null;
    let unsubWinner: (() => void) | null = null;
    let unsubParticipantsUpdated: (() => void) | null = null;
    let unsubParticipantsCleared: (() => void) | null = null;
    let unsubWinnerReset: (() => void) | null = null;

    const setupLotteryWebSocket = async () => {
      try {
        const { getWebSocketClient } = await import('../../../utils/websocket');
        const wsClient = getWebSocketClient();
        await wsClient.connect();

        unsubStarted = wsClient.on('lottery_started', () => {
          setLotteryRuntimeState((prev) => ({ ...prev, is_running: true }));
          setLotteryStatusMessage('抽選を開始しました');
        });

        unsubStopped = wsClient.on('lottery_stopped', async () => {
          setLotteryRuntimeState((prev) => ({ ...prev, is_running: false }));
          try {
            await Promise.all([fetchLotterySettings(), fetchLotteryHistory(20), fetchLotteryRuntimeState()]);
          } catch (error) {
            console.error('Failed to refresh lottery data after stop:', error);
          }
        });

        unsubWinner = wsClient.on('lottery_winner', async () => {
          try {
            await Promise.all([fetchLotterySettings(), fetchLotteryHistory(20)]);
          } catch (error) {
            console.error('Failed to refresh lottery data after winner event:', error);
          }
        });

        unsubParticipantsUpdated = wsClient.on('lottery_participants_updated', (data: any) => {
          setLotteryRuntimeState((prev) => ({
            ...prev,
            participants_count: Array.isArray(data?.participants) ? data.participants.length : prev.participants_count,
          }));
        });

        unsubParticipantsCleared = wsClient.on('lottery_participants_cleared', () => {
          setLotteryRuntimeState((prev) => ({ ...prev, participants_count: 0, is_running: false }));
        });

        unsubWinnerReset = wsClient.on('lottery_winner_reset', () => {
          setLotterySettingsState((prev) => (prev ? { ...prev, last_winner: '' } : prev));
        });
      } catch (error) {
        console.error('Failed to setup WebSocket for lottery:', error);
      }
    };

    setupLotteryWebSocket();

    return () => {
      if (unsubStarted) unsubStarted();
      if (unsubStopped) unsubStopped();
      if (unsubWinner) unsubWinner();
      if (unsubParticipantsUpdated) unsubParticipantsUpdated();
      if (unsubParticipantsCleared) unsubParticipantsCleared();
      if (unsubWinnerReset) unsubWinnerReset();
    };
  }, []);

  const syncLotteryRewardSetting = async (rewardId: string | null) => {
    const response = await fetch(buildApiUrl('/api/lottery/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reward_id: rewardId ?? '' }),
    });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    await fetchLotterySettings();
  };

  const handleLotteryDraw = () =>
    executeLotteryDraw({
      readResponseError,
      setIsLotteryDrawing,
      setLotteryStatusMessage,
      fetchLotterySettings,
      fetchLotteryHistory,
      fetchLotteryRuntimeState,
    });

  const handleLotteryResetWinner = () =>
    executeLotteryResetWinner({
      readResponseError,
      setIsLotteryResettingWinner,
      setLotteryStatusMessage,
      fetchLotterySettings,
    });

  const handleRefreshSubscribers = () =>
    executeRefreshSubscribers({
      readResponseError,
      setIsRefreshingSubscribers,
      setSubscriberWarning,
      setLotteryStatusMessage,
    });

  const handleSaveLotteryLimits = () =>
    executeSaveLotteryLimits({
      readResponseError,
      lotteryBaseLimitInput,
      lotteryFinalLimitInput,
      setIsLotterySaving,
      setLotteryStatusMessage,
      fetchLotterySettings,
    });

  const handleDeleteLotteryHistory = (id: number) =>
    executeDeleteLotteryHistory({
      id,
      readResponseError,
      fetchLotteryHistory,
      setLotteryStatusMessage,
    });

  return {
    customRewards,
    lotterySettingsState,
    lotteryHistory,
    lotteryRuntimeState,
    lotteryBaseLimitInput,
    lotteryFinalLimitInput,
    isLotteryLoading,
    isLotteryDrawing,
    isLotterySaving,
    isLotteryResettingWinner,
    isRefreshingSubscribers,
    subscriberWarning,
    lotteryStatusMessage,
    setLotteryBaseLimitInput,
    setLotteryFinalLimitInput,
    fetchLotteryOverview,
    syncLotteryRewardSetting,
    handleLotteryDraw,
    handleLotteryResetWinner,
    handleRefreshSubscribers,
    handleSaveLotteryLimits,
    handleDeleteLotteryHistory,
    setLotteryStatusMessage,
  };
};
