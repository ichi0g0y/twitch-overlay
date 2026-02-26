import { useCallback } from 'react';
import type React from 'react';
import {
  appendIrcChannel,
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
} from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type { RichChatInputRef } from '../chat/RichChatInput';
import type { IrcConnection, UserInfoPopupState } from './types';
import { primaryIrcConnectionKey, sanitizeIrcMessage } from './utils';

export const useChatSidebarActions = ({
  activeTab,
  primaryChannelLogin,
  postingMessage,
  postingMessageLockRef,
  richInputRef,
  ircConnectionsRef,
  startIrcConnection,
  stopIrcConnection,
  hydrateIrcUserProfile,
  setPrimaryCredentialRefreshTick,
  setPostingMessage,
  setPostError,
  setInputHasContent,
  channelInput,
  ircChannels,
  onEnsureIrcPreview,
  setIrcChannels,
  setActiveTab,
  setChannelEditorOpen,
  setChannelInput,
  setChannelInputError,
  setIrcMessagesByChannel,
  clearIrcParticipants,
  setUserInfoPopup,
  setUserInfoProfile,
  setUserInfoLoading,
  setUserInfoError,
  setUserModerationLoading,
  setUserModerationMessage,
  setRawDataMessage,
  popoutChatUrl,
}: {
  activeTab: string;
  primaryChannelLogin: string;
  postingMessage: boolean;
  postingMessageLockRef: React.MutableRefObject<boolean>;
  richInputRef: React.MutableRefObject<RichChatInputRef | null>;
  ircConnectionsRef: React.MutableRefObject<Map<string, IrcConnection>>;
  startIrcConnection: (
    channel: string,
    options?: { connectionKey?: string; isPrimary?: boolean },
  ) => Promise<void>;
  stopIrcConnection: (channel: string) => void;
  hydrateIrcUserProfile: (userId?: string, usernameHint?: string) => Promise<void>;
  setPrimaryCredentialRefreshTick: React.Dispatch<React.SetStateAction<number>>;
  setPostingMessage: React.Dispatch<React.SetStateAction<boolean>>;
  setPostError: React.Dispatch<React.SetStateAction<string>>;
  setInputHasContent: React.Dispatch<React.SetStateAction<boolean>>;
  channelInput: string;
  ircChannels: string[];
  onEnsureIrcPreview?: (channelLogin: string) => void;
  setIrcChannels: React.Dispatch<React.SetStateAction<string[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setChannelEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setChannelInput: React.Dispatch<React.SetStateAction<string>>;
  setChannelInputError: React.Dispatch<React.SetStateAction<string>>;
  setIrcMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  clearIrcParticipants: (channel: string) => void;
  setUserInfoPopup: React.Dispatch<React.SetStateAction<UserInfoPopupState | null>>;
  setUserInfoProfile: React.Dispatch<React.SetStateAction<any>>;
  setUserInfoLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInfoError: React.Dispatch<React.SetStateAction<string>>;
  setUserModerationLoading: React.Dispatch<React.SetStateAction<'timeout' | 'block' | null>>;
  setUserModerationMessage: React.Dispatch<React.SetStateAction<string>>;
  setRawDataMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  popoutChatUrl: string;
}) => {
  const sendComment = useCallback(async () => {
    if (postingMessageLockRef.current || postingMessage) return;

    const text = richInputRef.current?.getIrcText() ?? '';
    const ircText = sanitizeIrcMessage(text);
    if (!ircText) return;

    const isPrimaryTab = activeTab === PRIMARY_CHAT_TAB_ID;
    const primaryConnectionId = primaryChannelLogin
      ? primaryIrcConnectionKey(primaryChannelLogin)
      : '';

    setPostError('');
    postingMessageLockRef.current = true;
    setPostingMessage(true);
    try {
      const connectionKey = isPrimaryTab ? primaryConnectionId : activeTab;
      if (!connectionKey) {
        throw new Error('メインチャンネルのIRC接続を初期化できませんでした。Twitch認証を確認してください。');
      }

      const connection = ircConnectionsRef.current.get(connectionKey);
      if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
        throw new Error('IRCが未接続です。接続状態を確認してください。');
      }
      const targetChannel = connection.channel;
      if (!connection.authenticated) {
        stopIrcConnection(connectionKey);
        await startIrcConnection(targetChannel, {
          connectionKey,
          isPrimary: isPrimaryTab,
        });
        setPrimaryCredentialRefreshTick((current) => current + 1);
        throw new Error('IRC認証を更新中です。数秒後に再投稿してください。');
      }

      connection.ws.send(`PRIVMSG #${targetChannel} :${ircText}`);
      if (connection.userId) {
        void hydrateIrcUserProfile(connection.userId, connection.displayName || connection.nick);
      }

      richInputRef.current?.clear();
      setInputHasContent(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '投稿に失敗しました';
      setPostError(message);
      console.error('[ChatSidebar] Failed to post comment:', error);
    } finally {
      postingMessageLockRef.current = false;
      setPostingMessage(false);
    }
  }, [
    activeTab,
    hydrateIrcUserProfile,
    ircConnectionsRef,
    postingMessage,
    postingMessageLockRef,
    primaryChannelLogin,
    richInputRef,
    setInputHasContent,
    setPostError,
    setPostingMessage,
    setPrimaryCredentialRefreshTick,
    startIrcConnection,
    stopIrcConnection,
  ]);

  const handleAddChannel = useCallback(() => {
    const normalized = normalizeTwitchChannelName(channelInput);
    if (!normalized) {
      setChannelInputError('チャンネル名は英数字/アンダースコア (3-25文字) で入力してください');
      return;
    }

    if (ircChannels.includes(normalized)) {
      setActiveTab(normalized);
      onEnsureIrcPreview?.(normalized);
      setChannelEditorOpen(false);
      setChannelInput('');
      setChannelInputError('');
      return;
    }

    setIrcChannels((prev) => appendIrcChannel(prev, normalized));
    setActiveTab(normalized);
    onEnsureIrcPreview?.(normalized);
    setChannelEditorOpen(false);
    setChannelInput('');
    setChannelInputError('');
  }, [
    channelInput,
    ircChannels,
    onEnsureIrcPreview,
    setActiveTab,
    setChannelEditorOpen,
    setChannelInput,
    setChannelInputError,
    setIrcChannels,
  ]);

  const handleRemoveChannel = useCallback((channel: string) => {
    setIrcChannels((prev) => prev.filter((item) => item !== channel));
    setIrcMessagesByChannel((prev) => {
      if (!(channel in prev)) return prev;
      const next = { ...prev };
      delete next[channel];
      return next;
    });
    if (activeTab === channel) {
      setActiveTab(PRIMARY_CHAT_TAB_ID);
    }
    clearIrcParticipants(channel);
    setUserInfoPopup((prev) => (prev?.tabId === channel ? null : prev));
  }, [
    activeTab,
    clearIrcParticipants,
    setActiveTab,
    setIrcChannels,
    setIrcMessagesByChannel,
    setUserInfoPopup,
  ]);

  const handleOpenUserInfo = useCallback((message: ChatMessage) => {
    setUserInfoProfile(null);
    setUserInfoLoading(false);
    setUserInfoError('');
    setUserModerationLoading(null);
    setUserModerationMessage('');
    setUserInfoPopup({ message, tabId: activeTab });
  }, [
    activeTab,
    setUserInfoError,
    setUserInfoLoading,
    setUserInfoPopup,
    setUserInfoProfile,
    setUserModerationLoading,
    setUserModerationMessage,
  ]);

  const handleCloseUserInfo = useCallback(() => {
    setUserInfoProfile(null);
    setUserInfoLoading(false);
    setUserInfoError('');
    setUserModerationLoading(null);
    setUserModerationMessage('');
    setUserInfoPopup(null);
  }, [
    setUserInfoError,
    setUserInfoLoading,
    setUserInfoPopup,
    setUserInfoProfile,
    setUserModerationLoading,
    setUserModerationMessage,
  ]);

  const handleOpenRawData = useCallback((message: ChatMessage) => {
    setRawDataMessage(message);
  }, [setRawDataMessage]);

  const handleCloseRawData = useCallback(() => {
    setRawDataMessage(null);
  }, [setRawDataMessage]);

  const handleOpenChatPopout = useCallback(() => {
    if (!popoutChatUrl) return;
    window.open(popoutChatUrl, '_blank', 'noopener,noreferrer');
  }, [popoutChatUrl]);

  return {
    sendComment,
    handleAddChannel,
    handleRemoveChannel,
    handleOpenUserInfo,
    handleCloseUserInfo,
    handleOpenRawData,
    handleCloseRawData,
    handleOpenChatPopout,
  };
};
