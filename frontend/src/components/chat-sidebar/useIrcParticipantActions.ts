import { useCallback } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import { normalizeTwitchChannelName } from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type { IrcParticipant, IrcUserProfile } from './types';
import { IRC_HISTORY_LIMIT, dedupeMessages, trimMessagesByAge } from './utils';

export const useIrcParticipantActions = ({
  setIrcMessagesByChannel,
  ircUserProfilesRef,
  ircParticipantsByChannelRef,
  setIrcParticipantsVersion,
  ircRecentRawLinesRef,
  ircRecentMessageKeysRef,
}: {
  setIrcMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  ircUserProfilesRef: React.MutableRefObject<Record<string, IrcUserProfile>>;
  ircParticipantsByChannelRef: React.MutableRefObject<Record<string, Record<string, IrcParticipant>>>;
  setIrcParticipantsVersion: React.Dispatch<React.SetStateAction<number>>;
  ircRecentRawLinesRef: React.MutableRefObject<Map<string, number>>;
  ircRecentMessageKeysRef: React.MutableRefObject<Map<string, number>>;
}) => {
  const appendIrcMessage = useCallback((channel: string, message: ChatMessage) => {
    const profile = message.userId ? ircUserProfilesRef.current[message.userId] : undefined;
    const mergedMessage: ChatMessage = profile
      ? {
        ...message,
        username: profile.username || message.username,
        displayName: profile.displayName || message.displayName,
        avatarUrl: profile.avatarUrl || message.avatarUrl,
      }
      : message;
    setIrcMessagesByChannel((prev) => {
      const current = prev[channel] ?? [];
      const next = dedupeMessages(trimMessagesByAge([...current, mergedMessage]));
      return { ...prev, [channel]: next.slice(-IRC_HISTORY_LIMIT) };
    });
  }, [ircUserProfilesRef, setIrcMessagesByChannel]);

  const upsertIrcParticipant = useCallback((
    channel: string,
    payload: { userLogin?: string; userName?: string; userId?: string },
  ) => {
    const normalizedChannel = normalizeTwitchChannelName(channel);
    if (!normalizedChannel) return;

    const userId = (payload.userId || '').trim();
    const userLogin = normalizeTwitchChannelName(payload.userLogin || payload.userName || '') || '';
    if (userLogin === '' && userId === '') return;

    const bucket = ircParticipantsByChannelRef.current[normalizedChannel] ?? {};
    ircParticipantsByChannelRef.current[normalizedChannel] = bucket;
    const preferredKey = userLogin !== '' ? userLogin : `id:${userId}`;
    const legacyIdKey = userId !== '' ? `id:${userId}` : '';
    const current = bucket[preferredKey] || (legacyIdKey ? bucket[legacyIdKey] : undefined);
    const nextName = (payload.userName || '').trim() || current?.userName || userLogin || userId;
    const next: IrcParticipant = {
      userId: userId || current?.userId,
      userLogin: userLogin || current?.userLogin || '',
      userName: nextName,
      lastSeenAt: Date.now(),
    };

    let changed = false;
    const before = current ? JSON.stringify(current) : '';
    const after = JSON.stringify(next);
    if (before !== after) changed = true;
    bucket[preferredKey] = next;
    if (legacyIdKey && preferredKey !== legacyIdKey && bucket[legacyIdKey]) {
      delete bucket[legacyIdKey];
      changed = true;
    }
    if (changed) setIrcParticipantsVersion((value) => value + 1);
  }, [ircParticipantsByChannelRef, setIrcParticipantsVersion]);

  const applyIrcNames = useCallback((channel: string, logins: string[]) => {
    const normalizedChannel = normalizeTwitchChannelName(channel);
    if (!normalizedChannel || logins.length === 0) return;

    const bucket = ircParticipantsByChannelRef.current[normalizedChannel] ?? {};
    ircParticipantsByChannelRef.current[normalizedChannel] = bucket;
    let changed = false;
    for (const login of logins) {
      const normalizedLogin = normalizeTwitchChannelName(login);
      if (!normalizedLogin) continue;
      if (!bucket[normalizedLogin]) {
        bucket[normalizedLogin] = {
          userLogin: normalizedLogin,
          userName: normalizedLogin,
          lastSeenAt: Date.now(),
        };
        changed = true;
      }
    }
    if (changed) setIrcParticipantsVersion((value) => value + 1);
  }, [ircParticipantsByChannelRef, setIrcParticipantsVersion]);

  const removeIrcParticipant = useCallback((channel: string, userLogin: string) => {
    const normalizedChannel = normalizeTwitchChannelName(channel);
    const normalizedLogin = normalizeTwitchChannelName(userLogin);
    if (!normalizedChannel || !normalizedLogin) return;

    const bucket = ircParticipantsByChannelRef.current[normalizedChannel];
    if (!bucket) return;
    let changed = false;
    if (bucket[normalizedLogin]) {
      delete bucket[normalizedLogin];
      changed = true;
    }
    for (const key of Object.keys(bucket)) {
      if (bucket[key]?.userLogin === normalizedLogin && key !== normalizedLogin) {
        delete bucket[key];
        changed = true;
      }
    }
    if (changed) setIrcParticipantsVersion((value) => value + 1);
  }, [ircParticipantsByChannelRef, setIrcParticipantsVersion]);

  const clearIrcParticipants = useCallback((channel: string) => {
    const normalizedChannel = normalizeTwitchChannelName(channel);
    if (!normalizedChannel) return;
    if (ircParticipantsByChannelRef.current[normalizedChannel]) {
      delete ircParticipantsByChannelRef.current[normalizedChannel];
      setIrcParticipantsVersion((value) => value + 1);
    }
  }, [ircParticipantsByChannelRef, setIrcParticipantsVersion]);

  const shouldIgnoreDuplicateIrcLine = useCallback((line: string) => {
    const now = Date.now();
    const ttlMs = 2500;
    const recent = ircRecentRawLinesRef.current;
    for (const [key, timestamp] of recent.entries()) {
      if (now - timestamp > ttlMs) recent.delete(key);
    }
    const lastSeen = recent.get(line);
    recent.set(line, now);
    return typeof lastSeen === 'number' && (now - lastSeen) < ttlMs;
  }, [ircRecentRawLinesRef]);

  const shouldIgnoreDuplicateIrcMessage = useCallback((channel: string, message: ChatMessage) => {
    const now = Date.now();
    const ttlMs = 3000;
    const recent = ircRecentMessageKeysRef.current;
    for (const [key, timestamp] of recent.entries()) {
      if (now - timestamp > ttlMs) recent.delete(key);
    }

    const msgId = (message.messageId || '').trim();
    let key = '';
    if (msgId !== '' && !msgId.startsWith('irc-')) {
      key = `id|${channel}|${msgId}`;
    } else {
      const actor = (message.username || message.userId || '').trim().toLowerCase();
      const body = message.message.trim().replace(/\s+/g, ' ');
      if (actor === '' || body === '') return false;
      key = `fallback|${channel}|${actor}|${body}`;
    }

    if (key === '') return false;
    const lastSeen = recent.get(key);
    recent.set(key, now);
    return typeof lastSeen === 'number' && (now - lastSeen) < ttlMs;
  }, [ircRecentMessageKeysRef]);

  const persistIrcMessage = useCallback(async (channel: string, message: ChatMessage) => {
    try {
      const response = await fetch(buildApiUrl('/api/chat/irc/message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          message_id: message.messageId,
          user_id: message.userId,
          username: message.username,
          display_name: message.displayName,
          avatar_url: message.avatarUrl,
          color: message.color,
          message: message.message,
          badge_keys: message.badgeKeys,
          fragments: message.fragments ?? [{ type: 'text', text: message.message }],
          timestamp: message.timestamp,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('[ChatSidebar] Failed to persist IRC message:', error);
    }
  }, []);

  return {
    appendIrcMessage,
    upsertIrcParticipant,
    applyIrcNames,
    removeIrcParticipant,
    clearIrcParticipants,
    shouldIgnoreDuplicateIrcLine,
    shouldIgnoreDuplicateIrcMessage,
    persistIrcMessage,
  };
};
