import { buildApiUrl } from '../../../utils/api';

interface ReadError {
  (response: Response): Promise<string>;
}

interface StateSetter<T> {
  (value: T | ((prev: T) => T)): void;
}

export const executeLotteryDraw = async ({
  readResponseError,
  setIsLotteryDrawing,
  setLotteryStatusMessage,
  fetchLotterySettings,
  fetchLotteryHistory,
  fetchLotteryRuntimeState,
}: {
  readResponseError: ReadError;
  setIsLotteryDrawing: StateSetter<boolean>;
  setLotteryStatusMessage: StateSetter<string>;
  fetchLotterySettings: () => Promise<void>;
  fetchLotteryHistory: (limit?: number) => Promise<void>;
  fetchLotteryRuntimeState: () => Promise<void>;
}) => {
  setIsLotteryDrawing(true);
  setLotteryStatusMessage('');
  try {
    const response = await fetch(buildApiUrl('/api/lottery/draw'), { method: 'POST' });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    setLotteryStatusMessage('抽選を実行しました');
    await Promise.all([fetchLotterySettings(), fetchLotteryHistory(20), fetchLotteryRuntimeState()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLotteryStatusMessage(`抽選に失敗しました: ${message}`);
    alert(`抽選に失敗しました: ${message}`);
  } finally {
    setIsLotteryDrawing(false);
  }
};

export const executeLotteryResetWinner = async ({
  readResponseError,
  setIsLotteryResettingWinner,
  setLotteryStatusMessage,
  fetchLotterySettings,
}: {
  readResponseError: ReadError;
  setIsLotteryResettingWinner: StateSetter<boolean>;
  setLotteryStatusMessage: StateSetter<string>;
  fetchLotterySettings: () => Promise<void>;
}) => {
  setIsLotteryResettingWinner(true);
  setLotteryStatusMessage('');
  try {
    const response = await fetch(buildApiUrl('/api/lottery/reset-winner'), { method: 'POST' });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    await fetchLotterySettings();
    setLotteryStatusMessage('前回当選者をリセットしました');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLotteryStatusMessage(`前回当選者のリセットに失敗しました: ${message}`);
    alert(`前回当選者のリセットに失敗しました: ${message}`);
  } finally {
    setIsLotteryResettingWinner(false);
  }
};

export const executeRefreshSubscribers = async ({
  readResponseError,
  setIsRefreshingSubscribers,
  setSubscriberWarning,
  setLotteryStatusMessage,
}: {
  readResponseError: ReadError;
  setIsRefreshingSubscribers: StateSetter<boolean>;
  setSubscriberWarning: StateSetter<string | null>;
  setLotteryStatusMessage: StateSetter<string>;
}) => {
  setIsRefreshingSubscribers(true);
  setSubscriberWarning(null);
  setLotteryStatusMessage('');
  try {
    const response = await fetch(buildApiUrl('/api/present/refresh-subscribers'), { method: 'POST' });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const result = await response.json() as { updated?: number; failed_users?: unknown[] };
    const failedUsers = Array.isArray(result.failed_users)
      ? result.failed_users.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    if (failedUsers.length > 0) {
      setSubscriberWarning(`一部ユーザーのサブスク情報取得に失敗しました（${failedUsers.length}人）: ${failedUsers.join(', ')}`);
    }
    setLotteryStatusMessage(`${result.updated || 0}人のサブスク状況を更新しました`);
  } catch (error) {
    console.error('Failed to refresh subscriber status:', error);
    setSubscriberWarning('サブスク状況の更新に失敗しました');
  } finally {
    setIsRefreshingSubscribers(false);
  }
};

export const executeSaveLotteryLimits = async ({
  readResponseError,
  lotteryBaseLimitInput,
  lotteryFinalLimitInput,
  setIsLotterySaving,
  setLotteryStatusMessage,
  fetchLotterySettings,
}: {
  readResponseError: ReadError;
  lotteryBaseLimitInput: number;
  lotteryFinalLimitInput: number;
  setIsLotterySaving: StateSetter<boolean>;
  setLotteryStatusMessage: StateSetter<string>;
  fetchLotterySettings: () => Promise<void>;
}) => {
  if (!Number.isFinite(lotteryBaseLimitInput) || lotteryBaseLimitInput <= 0) {
    alert('基本口数上限は1以上を指定してください');
    return;
  }
  if (!Number.isFinite(lotteryFinalLimitInput) || lotteryFinalLimitInput < 0) {
    alert('最終口数上限は0以上を指定してください');
    return;
  }

  setIsLotterySaving(true);
  setLotteryStatusMessage('');
  try {
    const response = await fetch(buildApiUrl('/api/lottery/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tickets_limit: lotteryBaseLimitInput,
        final_tickets_limit: lotteryFinalLimitInput,
      }),
    });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    await fetchLotterySettings();
    setLotteryStatusMessage('抽選設定を保存しました');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setLotteryStatusMessage(`抽選設定の保存に失敗しました: ${message}`);
    alert(`抽選設定の保存に失敗しました: ${message}`);
  } finally {
    setIsLotterySaving(false);
  }
};

export const executeDeleteLotteryHistory = async ({
  id,
  readResponseError,
  fetchLotteryHistory,
  setLotteryStatusMessage,
}: {
  id: number;
  readResponseError: ReadError;
  fetchLotteryHistory: (limit?: number) => Promise<void>;
  setLotteryStatusMessage: StateSetter<string>;
}) => {
  try {
    const response = await fetch(buildApiUrl(`/api/lottery/history/${id}`), { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }
    await fetchLotteryHistory(20);
    setLotteryStatusMessage('抽選履歴を削除しました');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`抽選履歴の削除に失敗しました: ${message}`);
  }
};
