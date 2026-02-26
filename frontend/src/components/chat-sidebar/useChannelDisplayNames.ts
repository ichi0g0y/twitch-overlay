import { useCallback, useEffect } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import {
  normalizeTwitchChannelName,
} from '../../utils/chatChannels';
import type { IrcChannelDisplayProfile } from './types';
import {
  DISPLAY_NAME_REFRESH_INTERVAL_MS,
  DISPLAY_NAME_REFRESH_TICK_MS,
  IVR_TWITCH_USER_ENDPOINT,
  isLoginLikeDisplayName,
} from './utils';

export const useChannelDisplayNames = ({
  ircChannels,
  channelDisplayNames,
  displayNameRefreshTick,
  tabDisplayNamesByChannel,
  tabDisplayNameUpdatedAtByChannel,
  tabDisplayNameInFlightRef,
  setTabDisplayNamesByChannel,
  setTabDisplayNameUpdatedAtByChannel,
}: {
  ircChannels: string[];
  channelDisplayNames: Record<string, string>;
  displayNameRefreshTick: number;
  tabDisplayNamesByChannel: Record<string, string>;
  tabDisplayNameUpdatedAtByChannel: Record<string, number>;
  tabDisplayNameInFlightRef: React.MutableRefObject<Set<string>>;
  setTabDisplayNamesByChannel: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTabDisplayNameUpdatedAtByChannel: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) => {
  const persistIrcChannelDisplayName = useCallback(async (channel: string, displayName: string) => {
    const normalized = normalizeTwitchChannelName(channel);
    const name = displayName.trim();
    if (!normalized || name === '') return;

    try {
      await fetch(buildApiUrl('/api/chat/irc/channel-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: normalized,
          display_name: name,
        }),
      });
    } catch (error) {
      console.error(`[ChatSidebar] Failed to persist channel display name (#${normalized}):`, error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const channels = ircChannels
      .map((rawChannel) => normalizeTwitchChannelName(rawChannel))
      .filter((channel): channel is string => !!channel);

    if (channels.length === 0) {
      return;
    }

    const loadPersistedDisplayNames = async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/api/chat/irc/channel-profiles?channels=${encodeURIComponent(channels.join(','))}`),
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const profiles = Array.isArray(payload?.profiles) ? payload.profiles as IrcChannelDisplayProfile[] : [];
        if (profiles.length === 0 || cancelled) return;

        setTabDisplayNamesByChannel((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const profile of profiles) {
            const channel = normalizeTwitchChannelName(profile?.channel_login || '');
            const displayName = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
            if (!channel || displayName === '') continue;
            if ((next[channel] || '').trim() === displayName) continue;
            next[channel] = displayName;
            changed = true;
          }
          return changed ? next : prev;
        });

        setTabDisplayNameUpdatedAtByChannel((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const profile of profiles) {
            const channel = normalizeTwitchChannelName(profile?.channel_login || '');
            const updatedAt = Number(profile?.updated_at ?? 0);
            if (!channel || !Number.isFinite(updatedAt) || updatedAt <= 0) continue;
            if ((next[channel] || 0) === updatedAt) continue;
            next[channel] = updatedAt;
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch (error) {
        console.error('[ChatSidebar] Failed to load persisted channel display names:', error);
      }
    };

    void loadPersistedDisplayNames();

    return () => {
      cancelled = true;
    };
  }, [ircChannels, setTabDisplayNameUpdatedAtByChannel, setTabDisplayNamesByChannel]);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const candidates = ircChannels
      .map((rawChannel) => normalizeTwitchChannelName(rawChannel))
      .filter((channel): channel is string => !!channel)
      .filter((channel) => {
        const presetName = (channelDisplayNames[channel] || '').trim();
        const cachedName = (tabDisplayNamesByChannel[channel] || '').trim();
        const currentDisplayName = (
          (!isLoginLikeDisplayName(presetName, channel) ? presetName : '')
          || (!isLoginLikeDisplayName(cachedName, channel) ? cachedName : '')
          || presetName
          || cachedName
        ).trim();
        const updatedAt = Number(tabDisplayNameUpdatedAtByChannel[channel] || 0);
        const elapsedMs = now - (updatedAt * 1000);
        const isStale = updatedAt <= 0 || elapsedMs >= DISPLAY_NAME_REFRESH_INTERVAL_MS;
        const unresolved = currentDisplayName === '' || isLoginLikeDisplayName(currentDisplayName, channel);
        const unresolvedRetryDue = updatedAt <= 0 || elapsedMs >= DISPLAY_NAME_REFRESH_TICK_MS;
        const shouldRefresh = unresolved ? unresolvedRetryDue : isStale;
        if (!shouldRefresh) return false;
        return !tabDisplayNameInFlightRef.current.has(channel);
      });

    if (candidates.length === 0) {
      return;
    }

    const loadDisplayName = async (channel: string) => {
      tabDisplayNameInFlightRef.current.add(channel);
      try {
        let nextName = '';
        let apiDisplayName = '';
        let apiFallbackName = '';
        const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: channel,
            username: channel,
          }),
        });
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          apiDisplayName = typeof payload?.display_name === 'string'
            ? payload.display_name.trim()
            : '';
          apiFallbackName = typeof payload?.username === 'string'
            ? payload.username.trim()
            : '';
          if (apiDisplayName !== '' && !isLoginLikeDisplayName(apiDisplayName, channel)) {
            nextName = apiDisplayName;
          } else if (apiFallbackName !== '' && !isLoginLikeDisplayName(apiFallbackName, channel)) {
            nextName = apiFallbackName;
          }
        }

        if (!nextName) {
          const ivrResponse = await fetch(`${IVR_TWITCH_USER_ENDPOINT}?login=${encodeURIComponent(channel)}`);
          if (ivrResponse.ok) {
            const ivrPayload = await ivrResponse.json().catch(() => null);
            const first = Array.isArray(ivrPayload) ? ivrPayload[0] : null;
            const ivrDisplayName = typeof first?.displayName === 'string' ? first.displayName.trim() : '';
            const ivrLogin = typeof first?.login === 'string' ? first.login.trim() : '';
            if (ivrDisplayName !== '' && !isLoginLikeDisplayName(ivrDisplayName, channel)) {
              nextName = ivrDisplayName;
            } else if (ivrLogin !== '' && !isLoginLikeDisplayName(ivrLogin, channel)) {
              nextName = ivrLogin;
            }
          }
        }

        if (!nextName) {
          nextName = apiDisplayName || apiFallbackName;
        }
        if (!nextName || cancelled) return;
        const updatedAt = Math.floor(Date.now() / 1000);
        setTabDisplayNamesByChannel((prev) => {
          if ((prev[channel] || '').trim() === nextName) return prev;
          return { ...prev, [channel]: nextName };
        });
        setTabDisplayNameUpdatedAtByChannel((prev) => {
          if ((prev[channel] || 0) === updatedAt) return prev;
          return { ...prev, [channel]: updatedAt };
        });
        void persistIrcChannelDisplayName(channel, nextName);
      } catch (error) {
        console.error(`[ChatSidebar] Failed to load tab display name (#${channel}):`, error);
      } finally {
        tabDisplayNameInFlightRef.current.delete(channel);
      }
    };

    void Promise.all(candidates.map((channel) => loadDisplayName(channel)));

    return () => {
      cancelled = true;
    };
  }, [
    channelDisplayNames,
    displayNameRefreshTick,
    ircChannels,
    persistIrcChannelDisplayName,
    setTabDisplayNameUpdatedAtByChannel,
    setTabDisplayNamesByChannel,
    tabDisplayNameInFlightRef,
    tabDisplayNameUpdatedAtByChannel,
    tabDisplayNamesByChannel,
  ]);
};
