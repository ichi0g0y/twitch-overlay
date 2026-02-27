import { useCallback, useMemo } from 'react';
import type React from 'react';
import { PRIMARY_CHAT_TAB_ID, normalizeTwitchChannelName } from '../../utils/chatChannels';
import type { ChattersPanelChatter } from '../ChattersPanel';
import type { ChatMessage } from '../ChatSidebarItem';
import type { ChatDisplayItem, IrcParticipant } from './types';
import { resolveDateSeparatorInfo } from './utils';

export const buildFallbackChatters = ({
  activeTab,
  primaryChannelLogin,
  activeMessages,
  ircParticipantsByChannel,
}: {
  activeTab: string;
  primaryChannelLogin: string;
  activeMessages: ChatMessage[];
  ircParticipantsByChannel: Record<string, Record<string, IrcParticipant>>;
}): ChattersPanelChatter[] => {
  const activeParticipantChannel = activeTab === PRIMARY_CHAT_TAB_ID
    ? (normalizeTwitchChannelName(primaryChannelLogin) || '')
    : (normalizeTwitchChannelName(activeTab) || '');
  const participants = new Map<string, ChattersPanelChatter>();

  if (activeParticipantChannel !== '') {
    const snapshot = ircParticipantsByChannel[activeParticipantChannel] ?? {};
    for (const participant of Object.values(snapshot)) {
      const userId = (participant.userId || '').trim();
      const userLogin = normalizeTwitchChannelName(participant.userLogin) || '';
      const userName = (participant.userName || '').trim() || userLogin || userId;
      const key = userLogin !== '' ? `login:${userLogin}` : (userId !== '' ? `id:${userId}` : '');
      if (key === '') continue;
      participants.set(key, { user_id: userId, user_login: userLogin, user_name: userName });
    }
  }

  for (const item of activeMessages) {
    const userId = (item.userId || '').trim();
    const userName = (item.displayName || item.username || '').trim();
    const userLogin = normalizeTwitchChannelName(item.username || '') || '';
    const keyById = userId !== ''
      ? Array.from(participants.entries()).find(([, value]) => value.user_id === userId)?.[0]
      : undefined;
    const key = keyById || (userLogin !== '' ? `login:${userLogin}` : '') || (userId !== '' ? `id:${userId}` : '');
    if (key === '') continue;
    const current = participants.get(key);
    participants.set(key, {
      user_id: userId || current?.user_id || '',
      user_login: userLogin || current?.user_login || '',
      user_name: userName || current?.user_name || userLogin,
    });
  }

  return Array.from(participants.values()).sort((a, b) => a.user_name.localeCompare(b.user_name, 'ja'));
};

export const buildDisplayedItems = (messages: ChatMessage[]): ChatDisplayItem[] => {
  const items: ChatDisplayItem[] = [];
  let previousDateKey = '';
  let messageIndex = 0;

  for (const message of messages) {
    const dateInfo = resolveDateSeparatorInfo(message.timestamp);
    if (dateInfo.key !== previousDateKey) {
      items.push({
        type: 'date-separator',
        key: `date-${dateInfo.key}-${items.length}`,
        label: dateInfo.label,
      });
      previousDateKey = dateInfo.key;
    }
    items.push({
      type: 'message',
      key: message.id,
      message,
      index: messageIndex,
    });
    messageIndex += 1;
  }

  return items;
};

export const useChatMessageDisplayState = ({
  activeTab,
  primaryMessages,
  ircMessagesByChannel,
  primaryChannelLogin,
  ircParticipantsByChannelRef,
  ircParticipantsVersion,
  messageOrderReversedByTab,
}: {
  activeTab: string;
  primaryMessages: ChatMessage[];
  ircMessagesByChannel: Record<string, ChatMessage[]>;
  primaryChannelLogin: string;
  ircParticipantsByChannelRef: React.MutableRefObject<Record<string, Record<string, IrcParticipant>>>;
  ircParticipantsVersion: number;
  messageOrderReversedByTab: Record<string, boolean>;
}) => {
  const activeMessages = useMemo(
    () => (activeTab === PRIMARY_CHAT_TAB_ID ? primaryMessages : (ircMessagesByChannel[activeTab] ?? [])),
    [activeTab, ircMessagesByChannel, primaryMessages],
  );
  const fallbackChatters = useMemo<ChattersPanelChatter[]>(
    () => buildFallbackChatters({
      activeTab,
      primaryChannelLogin,
      activeMessages,
      ircParticipantsByChannel: ircParticipantsByChannelRef.current,
    }),
    [activeMessages, activeTab, ircParticipantsVersion, ircParticipantsByChannelRef, primaryChannelLogin],
  );

  const messageOrderReversed = messageOrderReversedByTab[activeTab] === true;
  const displayedMessages = useMemo(
    () => (messageOrderReversed ? [...activeMessages].reverse() : activeMessages),
    [activeMessages, messageOrderReversed],
  );
  const displayedItems = useMemo<ChatDisplayItem[]>(
    () => buildDisplayedItems(displayedMessages),
    [displayedMessages],
  );

  const resolveTabChannelLogin = useCallback((tabId: string) => {
    if (tabId === PRIMARY_CHAT_TAB_ID) {
      return normalizeTwitchChannelName(primaryChannelLogin || '') || '';
    }
    return normalizeTwitchChannelName(tabId || '') || '';
  }, [primaryChannelLogin]);
  const activeTabChannelLogin = useMemo(
    () => resolveTabChannelLogin(activeTab),
    [activeTab, resolveTabChannelLogin],
  );
  const popoutChatUrl = useMemo(
    () => (activeTabChannelLogin ? `https://www.twitch.tv/popout/${encodeURIComponent(activeTabChannelLogin)}/chat?popout=` : ''),
    [activeTabChannelLogin],
  );

  return {
    activeMessages,
    fallbackChatters,
    messageOrderReversed,
    displayedItems,
    resolveTabChannelLogin,
    popoutChatUrl,
  };
};
