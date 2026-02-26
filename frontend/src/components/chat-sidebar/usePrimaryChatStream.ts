import { useEffect } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import { getWebSocketClient } from '../../utils/websocket';
import type { ChatMessage } from '../ChatSidebarItem';
import {
  HISTORY_DAYS,
  dedupeMessages,
  normalizeFragments,
  trimMessagesByAge,
} from './utils';

export const usePrimaryChatStream = ({
  setPrimaryMessages,
}: {
  setPrimaryMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) => {
  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const url = buildApiUrl(`/api/chat/history?days=${HISTORY_DAYS}`);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          const rawMessages = Array.isArray(payload) ? payload : payload?.messages;
          if (!Array.isArray(rawMessages)) {
            throw new Error('Invalid history payload');
          }

          const history: ChatMessage[] = rawMessages.map((item: any) => ({
            id: item.id ? String(item.id) : `${item.timestamp || Date.now()}-${Math.random().toString(36).slice(2)}`,
            messageId: item.messageId ?? item.message_id,
            userId: item.userId ?? item.user_id,
            username: item.username || '',
            displayName: item.displayName ?? item.display_name,
            message: item.message,
            color: item.color,
            chatSource: 'eventsub',
            badgeKeys: Array.isArray(item.badge_keys)
              ? item.badge_keys.filter((value: unknown): value is string => typeof value === 'string')
              : undefined,
            fragments: normalizeFragments(item.fragments ?? item.fragments_json ?? item.fragmentsJson),
            avatarUrl: item.avatarUrl ?? item.avatar_url,
            translation: item.translation ?? item.translation_text,
            translationStatus: item.translationStatus ?? item.translation_status,
            translationLang: item.translationLang ?? item.translation_lang,
            timestamp: item.timestamp ?? (typeof item.created_at === 'number'
              ? new Date(item.created_at * 1000).toISOString()
              : undefined),
          }));

          if (!cancelled) {
            setPrimaryMessages(dedupeMessages(trimMessagesByAge(history)));
          }
          return;
        } catch (error) {
          if (attempt === maxAttempts || cancelled) {
            console.error('[ChatSidebar] Failed to load history:', error);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [setPrimaryMessages]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const wsClient = getWebSocketClient();

    const setup = async () => {
      try {
        await wsClient.connect();
        const messageUnsubscribe = wsClient.on('chat-message', (data: any) => {
          if (!data || !data.username || !data.message) return;
          const nextMessage: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            messageId: data.messageId,
            userId: data.userId,
            username: data.username,
            displayName: data.displayName || data.display_name,
            message: data.message,
            color: data.color,
            chatSource: data.chatSource === 'irc' ? 'irc' : 'eventsub',
            badgeKeys: Array.isArray(data.badge_keys)
              ? data.badge_keys.filter((value: unknown): value is string => typeof value === 'string')
              : undefined,
            fragments: normalizeFragments(data.fragments ?? data.fragments_json ?? data.fragmentsJson),
            avatarUrl: data.avatarUrl,
            translation: data.translation,
            translationStatus: data.translationStatus,
            translationLang: data.translationLang,
            timestamp: data.timestamp,
          };
          setPrimaryMessages((prev) => {
            const next = [...prev, nextMessage];
            return dedupeMessages(trimMessagesByAge(next));
          });
        });

        const translationUnsubscribe = wsClient.on('chat-translation', (data: any) => {
          if (!data || !data.messageId) return;
          setPrimaryMessages((prev) => prev.map((msg) => (
            msg.messageId === data.messageId
              ? {
                ...msg,
                translation: data.translation,
                translationStatus: data.translationStatus,
                translationLang: data.translationLang,
              }
              : msg
          )));
        });

        unsubscribe = () => {
          messageUnsubscribe?.();
          translationUnsubscribe?.();
        };
      } catch (error) {
        console.error('[ChatSidebar] Failed to setup WebSocket:', error);
      }
    };

    void setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [setPrimaryMessages]);
};
