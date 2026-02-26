import { useEffect } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import type { ChatMessage } from '../ChatSidebarItem';
import {
  IRC_HISTORY_LIMIT,
  dedupeMessages,
  normalizeFragments,
  trimMessagesByAge,
} from './utils';

export const useIrcHistoryLoader = ({
  ircChannels,
  setIrcMessagesByChannel,
  hydrateIrcUserProfile,
}: {
  ircChannels: string[];
  setIrcMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  hydrateIrcUserProfile: (userId?: string, usernameHint?: string) => Promise<void>;
}) => {
  useEffect(() => {
    let cancelled = false;

    const loadIrcHistory = async (channel: string) => {
      try {
        const response = await fetch(
          buildApiUrl(`/api/chat/irc/history?channel=${encodeURIComponent(channel)}&limit=${IRC_HISTORY_LIMIT}`),
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const rawMessages = Array.isArray(payload) ? payload : payload?.messages;
        if (!Array.isArray(rawMessages) || cancelled) return;

        const history: ChatMessage[] = rawMessages
          .map((item: any) => ({
            id: item.id ? String(item.id) : `${channel}-${item.message_id || item.messageId || Date.now()}`,
            messageId: item.messageId ?? item.message_id,
            userId: item.userId ?? item.user_id,
            username: item.username || '',
            displayName: item.displayName ?? item.display_name,
            message: item.message || '',
            badgeKeys: Array.isArray(item.badge_keys)
              ? item.badge_keys.filter((value: unknown): value is string => typeof value === 'string')
              : undefined,
            fragments: normalizeFragments(item.fragments ?? item.fragments_json ?? item.fragmentsJson),
            avatarUrl: item.avatarUrl ?? item.avatar_url,
            timestamp: item.timestamp ?? (typeof item.created_at === 'number'
              ? new Date(item.created_at * 1000).toISOString()
              : undefined),
          }))
          .filter((item) => item.message.trim() !== '');

        setIrcMessagesByChannel((prev) => {
          const current = prev[channel] ?? [];
          return {
            ...prev,
            [channel]: dedupeMessages(trimMessagesByAge([...history, ...current])),
          };
        });

        for (const item of history) {
          if (item.userId) {
            void hydrateIrcUserProfile(item.userId, item.username);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`[ChatSidebar] Failed to load IRC history (#${channel}):`, error);
        }
      }
    };

    for (const channel of ircChannels) {
      void loadIrcHistory(channel);
    }

    return () => {
      cancelled = true;
    };
  }, [hydrateIrcUserProfile, ircChannels, setIrcMessagesByChannel]);
};
