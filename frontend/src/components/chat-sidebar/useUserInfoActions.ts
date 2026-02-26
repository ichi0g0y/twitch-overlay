import { useCallback } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import { DEFAULT_TIMEOUT_SECONDS } from './utils';
import { copyTextToClipboard } from './clipboard';

export const useUserInfoActions = ({
  userInfoResolvedUserId,
  rawDataJson,
  userInfoCanTimeout,
  userInfoCanBlock,
  userModerationLoading,
  moderationTargetName,
  setUserInfoError,
  setUserModerationMessage,
  setUserModerationLoading,
  setUserInfoIdCopied,
  setRawDataCopied,
  userInfoIdCopiedTimerRef,
  rawDataCopiedTimerRef,
}: {
  userInfoResolvedUserId: string;
  rawDataJson: string;
  userInfoCanTimeout: boolean;
  userInfoCanBlock: boolean;
  userModerationLoading: 'timeout' | 'block' | null;
  moderationTargetName: string;
  setUserInfoError: React.Dispatch<React.SetStateAction<string>>;
  setUserModerationMessage: React.Dispatch<React.SetStateAction<string>>;
  setUserModerationLoading: React.Dispatch<React.SetStateAction<'timeout' | 'block' | null>>;
  setUserInfoIdCopied: React.Dispatch<React.SetStateAction<boolean>>;
  setRawDataCopied: React.Dispatch<React.SetStateAction<boolean>>;
  userInfoIdCopiedTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  rawDataCopiedTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) => {
  const copyUserInfoUserId = useCallback(async () => {
    if (userInfoResolvedUserId === '') return;
    try {
      await copyTextToClipboard(userInfoResolvedUserId);
      setUserInfoIdCopied(true);
      if (userInfoIdCopiedTimerRef.current !== null) {
        clearTimeout(userInfoIdCopiedTimerRef.current);
      }
      userInfoIdCopiedTimerRef.current = setTimeout(() => {
        setUserInfoIdCopied(false);
      }, 1200);
    } catch {
      setUserInfoError('ユーザーIDのコピーに失敗しました。');
    }
  }, [
    setUserInfoError,
    setUserInfoIdCopied,
    userInfoIdCopiedTimerRef,
    userInfoResolvedUserId,
  ]);

  const copyRawDataJson = useCallback(async () => {
    if (rawDataJson === '') return;
    try {
      await copyTextToClipboard(rawDataJson);
      setRawDataCopied(true);
      if (rawDataCopiedTimerRef.current !== null) {
        clearTimeout(rawDataCopiedTimerRef.current);
      }
      rawDataCopiedTimerRef.current = setTimeout(() => {
        setRawDataCopied(false);
      }, 1200);
    } catch (error) {
      console.error('[ChatSidebar] Failed to copy raw chat message JSON:', error);
    }
  }, [rawDataCopiedTimerRef, rawDataJson, setRawDataCopied]);

  const runModerationAction = useCallback(async (action: 'timeout' | 'block') => {
    if (userInfoResolvedUserId === '') return;
    if (userModerationLoading) return;
    if (action === 'timeout' && !userInfoCanTimeout) return;
    if (action === 'block' && !userInfoCanBlock) return;

    const confirmMessage = action === 'timeout'
      ? `${moderationTargetName} を10分タイムアウトします。実行しますか？`
      : `${moderationTargetName} をブロックします。実行しますか？`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;

    setUserInfoError('');
    setUserModerationMessage('');
    setUserModerationLoading(action);
    try {
      const response = await fetch(buildApiUrl('/api/chat/moderation/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          user_id: userInfoResolvedUserId,
          duration_seconds: action === 'timeout' ? DEFAULT_TIMEOUT_SECONDS : undefined,
          reason: action === 'timeout' ? 'overlay moderation action' : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const errorText = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
        throw new Error(errorText);
      }
      setUserModerationMessage(action === 'timeout' ? '10分タイムアウトを実行しました。' : 'ブロックを実行しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'モデレーション操作に失敗しました。';
      setUserInfoError(message);
    } finally {
      setUserModerationLoading(null);
    }
  }, [
    moderationTargetName,
    setUserInfoError,
    setUserModerationLoading,
    setUserModerationMessage,
    userInfoCanBlock,
    userInfoCanTimeout,
    userInfoResolvedUserId,
    userModerationLoading,
  ]);

  return {
    copyUserInfoUserId,
    copyRawDataJson,
    runModerationAction,
  };
};
