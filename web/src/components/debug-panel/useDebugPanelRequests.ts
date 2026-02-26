import { useCallback, useState } from 'react';
import { buildApiUrl } from '../../utils/api';

type DebugRequestFn = () => Promise<void>;

interface RunOptions {
  logLabel: string;
  alertMessage: string;
}

interface TriggerClockOptions {
  emptyLeaderboard?: boolean;
}

export function useDebugPanelRequests() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runRequest = useCallback(async (request: DebugRequestFn, options: RunOptions) => {
    if (isSubmitting) return false;
    setIsSubmitting(true);

    try {
      await request();
      return true;
    } catch (error) {
      console.error(`Failed to ${options.logLabel}:`, error);
      if (error instanceof Error) {
        alert(`${options.alertMessage}:\n${error.message}`);
      } else {
        alert(`${options.alertMessage}。サーバーが起動しているか確認してください。`);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting]);

  const postDebug = useCallback(async (endpoint: string, data: unknown = {}) => {
    const response = await fetch(buildApiUrl(`/debug/${endpoint}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.statusText} - ${errorText}`);
    }
  }, []);

  const sendChannelPoints = useCallback(async (username: string, userInput: string) => {
    const trimmed = userInput.trim();
    if (!trimmed) return false;

    return runRequest(
      () => postDebug('channel-points', {
        username: username.toLowerCase(),
        displayName: username,
        userInput: trimmed,
      }),
      {
        logLabel: 'send debug channel points',
        alertMessage: 'デバッグチャンネルポイントの送信に失敗しました',
      },
    );
  }, [postDebug, runRequest]);

  const triggerClock = useCallback(async ({ emptyLeaderboard }: TriggerClockOptions = {}) => {
    return runRequest(
      () => postDebug('clock', { withStats: true, ...(emptyLeaderboard ? { emptyLeaderboard: true } : {}) }),
      {
        logLabel: emptyLeaderboard ? 'trigger clock with empty leaderboard' : 'trigger clock',
        alertMessage: emptyLeaderboard
          ? '時計印刷（空のリーダーボード）の実行に失敗しました'
          : '時計印刷の実行に失敗しました',
      },
    );
  }, [postDebug, runRequest]);

  const triggerTwitchEvent = useCallback(async (endpoint: string, data?: unknown) => {
    return runRequest(
      () => postDebug(endpoint, data || {}),
      {
        logLabel: `trigger ${endpoint}`,
        alertMessage: 'イベント実行に失敗しました',
      },
    );
  }, [postDebug, runRequest]);

  return {
    isSubmitting,
    sendChannelPoints,
    triggerClock,
    triggerTwitchEvent,
  };
}
