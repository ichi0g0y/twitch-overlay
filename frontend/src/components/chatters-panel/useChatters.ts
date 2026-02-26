import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../../utils/api';
import type {
  ChattersPanelChatter,
  ChattersResponse,
} from './types';
import { SCOPE_MISSING_MESSAGE, chatterProfileKey } from './types';

const parseChattersRows = (payload: ChattersResponse | null): ChattersPanelChatter[] => {
  if (!Array.isArray(payload?.data)) return [];
  return payload.data.filter(
    (item): item is ChattersPanelChatter =>
      !!item
      && typeof item === 'object'
      && typeof (item as ChattersPanelChatter).user_id === 'string'
      && typeof (item as ChattersPanelChatter).user_login === 'string'
      && typeof (item as ChattersPanelChatter).user_name === 'string',
  );
};

export const useChatters = ({
  open,
  channelLogin,
  fallbackChatters,
}: {
  open: boolean;
  channelLogin?: string;
  fallbackChatters?: ChattersPanelChatter[];
}) => {
  const [chatters, setChatters] = useState<ChattersPanelChatter[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;

    const normalizedChannelLogin = (channelLogin || '').trim().toLowerCase();
    let cancelled = false;
    const loadChatters = async () => {
      setLoading(true);
      setError('');

      try {
        const endpoint =
          normalizedChannelLogin === ''
            ? '/api/twitch/chatters'
            : `/api/twitch/chatters?channel_login=${encodeURIComponent(
                normalizedChannelLogin,
              )}`;
        const response = await fetch(buildApiUrl(endpoint));
        if (!response.ok) {
          if (response.status === 403) {
            const fallbackRows = Array.isArray(fallbackChatters)
              ? fallbackChatters
              : [];
            if (fallbackRows.length > 0) {
              if (cancelled) return;
              setChatters(fallbackRows);
              setTotal(fallbackRows.length);
              setNotice(
                'Twitch APIの権限不足のため、IRCで観測できた参加者のみ表示しています。',
              );
              return;
            }
            if (normalizedChannelLogin !== '') {
              throw new Error(
                `@${normalizedChannelLogin} の視聴者一覧は取得できません（モデレーター権限またはスコープ不足）。`,
              );
            }
            throw new Error(SCOPE_MISSING_MESSAGE);
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const payload: ChattersResponse | null = await response
          .json()
          .catch(() => null);
        const rows = parseChattersRows(payload);
        const nextTotal =
          typeof payload?.total === 'number'
            ? payload.total
            : typeof payload?.count === 'number'
              ? payload.count
              : rows.length;
        if (cancelled) return;
        setChatters(rows);
        setTotal(nextTotal);
        setNotice('');
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : '視聴者一覧の取得に失敗しました。';
        setChatters([]);
        setTotal(null);
        setError(message);
        setNotice('');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadChatters();
    return () => {
      cancelled = true;
    };
  }, [channelLogin, fallbackChatters, open]);

  useEffect(() => {
    if (!open || notice === '') return;
    const fallbackRows = Array.isArray(fallbackChatters) ? fallbackChatters : [];
    setChatters(fallbackRows);
    setTotal(fallbackRows.length);
  }, [fallbackChatters, notice, open]);

  const chatterRows = useMemo(
    () => chatters.map((chatter) => ({ key: chatterProfileKey(chatter), chatter })),
    [chatters],
  );

  const headlineCount = useMemo(
    () => (typeof total === 'number' ? total : chatters.length),
    [chatters.length, total],
  );

  return {
    chatters,
    total,
    loading,
    error,
    notice,
    chatterRows,
    headlineCount,
  };
};
