import { useCallback, useRef } from 'react';
import { buildApiUrl } from '../../utils/api';
import { PRIMARY_CHAT_TAB_ID, normalizeTwitchChannelName } from '../../utils/chatChannels';

export const useEmoteOwnerResolver = ({
  activeTab,
  primaryChannelLogin,
}: {
  activeTab: string;
  primaryChannelLogin: string;
}) => {
  const emoteIdToChannelLoginRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<Map<string, Promise<string>>>(new Map());

  const cacheResolvedEmotes = useCallback((emotes: any[]) => {
    for (const emote of emotes) {
      const id = typeof (emote?.id ?? emote?.emote_id) === 'string' ? (emote.id ?? emote.emote_id).trim() : '';
      if (!id) continue;
      const rawChannelLogin = typeof (emote?.channel_login ?? emote?.channelLogin) === 'string'
        ? (emote.channel_login ?? emote.channelLogin)
        : '';
      const normalizedChannelLogin = normalizeTwitchChannelName(rawChannelLogin) || '';
      if (!normalizedChannelLogin) continue;
      emoteIdToChannelLoginRef.current[id] = normalizedChannelLogin;
    }
  }, []);

  const resolveOwnerLoginByEmoteId = useCallback(async (emoteId: string) => {
    const normalizedEmoteId = emoteId.trim();
    if (!normalizedEmoteId) return '';
    const cached = emoteIdToChannelLoginRef.current[normalizedEmoteId];
    if (cached && cached.trim() !== '') {
      return cached;
    }
    const inFlight = inFlightRef.current.get(normalizedEmoteId);
    if (inFlight) return inFlight;
    const task = (async () => {
      try {
        const fetchEmotes = async (query: string) => {
          const response = await fetch(query ? buildApiUrl(`/api/emotes?${query}`) : buildApiUrl('/api/emotes'));
          if (!response.ok) return [];
          const payload = await response.json().catch(() => null);
          return Array.isArray(payload?.data?.emotes) ? payload.data.emotes : [];
        };

        const activeChannelLogin = activeTab === PRIMARY_CHAT_TAB_ID
          ? (normalizeTwitchChannelName(primaryChannelLogin) || '')
          : (normalizeTwitchChannelName(activeTab) || '');
        const params = new URLSearchParams();
        if (activeChannelLogin) {
          params.set('channels', activeChannelLogin);
          params.set('priority_channel', activeChannelLogin);
        }
        const query = params.toString();

        const emotesInChannel = await fetchEmotes(query);
        cacheResolvedEmotes(emotesInChannel);
        const resolvedInChannel = emoteIdToChannelLoginRef.current[normalizedEmoteId];
        if (resolvedInChannel && resolvedInChannel.trim() !== '') {
          return resolvedInChannel;
        }

        const emotesGlobal = await fetchEmotes('');
        cacheResolvedEmotes(emotesGlobal);
        return emoteIdToChannelLoginRef.current[normalizedEmoteId] || '';
      } catch {
        return '';
      } finally {
        inFlightRef.current.delete(normalizedEmoteId);
      }
    })();
    inFlightRef.current.set(normalizedEmoteId, task);
    return task;
  }, [activeTab, cacheResolvedEmotes, primaryChannelLogin]);

  return { resolveOwnerLoginByEmoteId };
};
