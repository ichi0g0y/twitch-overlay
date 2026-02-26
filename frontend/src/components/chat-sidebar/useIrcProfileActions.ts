import { useCallback } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import { normalizeTwitchChannelName } from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type { ChatUserProfileDetail, IrcUserProfile } from './types';

export const useIrcProfileActions = ({
  setIrcMessagesByChannel,
  setPrimaryMessages,
  ircUserProfilesRef,
  ircProfileInFlightRef,
}: {
  setIrcMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  setPrimaryMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  ircUserProfilesRef: React.MutableRefObject<Record<string, IrcUserProfile>>;
  ircProfileInFlightRef: React.MutableRefObject<Set<string>>;
}) => {
  const applyIrcUserProfile = useCallback((userId: string, profile: IrcUserProfile) => {
    if (!userId) return;
    setIrcMessagesByChannel((prev) => {
      let updated = false;
      const next: Record<string, ChatMessage[]> = {};

      for (const [channel, messages] of Object.entries(prev)) {
        let channelUpdated = false;
        const nextMessages = messages.map((message) => {
          if (message.userId !== userId) return message;
          channelUpdated = true;
          return {
            ...message,
            username: profile.username || message.username,
            displayName: profile.displayName || message.displayName,
            avatarUrl: profile.avatarUrl || message.avatarUrl,
          };
        });
        next[channel] = nextMessages;
        if (channelUpdated) updated = true;
      }

      return updated ? next : prev;
    });

    setPrimaryMessages((prev) => {
      let updated = false;
      const next = prev.map((message) => {
        if (message.userId !== userId) return message;
        updated = true;
        return {
          ...message,
          username: profile.username || message.username,
          displayName: profile.displayName || message.displayName,
          avatarUrl: profile.avatarUrl || message.avatarUrl,
        };
      });
      return updated ? next : prev;
    });
  }, [setIrcMessagesByChannel, setPrimaryMessages]);

  const applyResolvedUserProfile = useCallback((profile: ChatUserProfileDetail) => {
    const userId = (profile.userId || '').trim();
    const normalizedLogin = normalizeTwitchChannelName(profile.login || profile.username || '') || '';
    const nextDisplayName = (profile.displayName || '').trim();
    const nextAvatarUrl = (profile.profileImageUrl || profile.avatarUrl || '').trim();
    const nextUsername = normalizedLogin || (profile.username || '').trim();
    const profilePatch: IrcUserProfile = {
      username: nextUsername || undefined,
      displayName: nextDisplayName || undefined,
      avatarUrl: nextAvatarUrl || undefined,
    };

    if (userId !== '') {
      ircUserProfilesRef.current[userId] = profilePatch;
      applyIrcUserProfile(userId, profilePatch);
    }

    if (normalizedLogin === '') return;

    const patchMessage = (message: ChatMessage): ChatMessage => {
      const messageLogin =
        normalizeTwitchChannelName(message.username || '')
        || normalizeTwitchChannelName(message.displayName || '')
        || '';
      if (messageLogin !== normalizedLogin) return message;
      return {
        ...message,
        username: nextUsername || message.username,
        displayName: nextDisplayName || message.displayName,
        avatarUrl: nextAvatarUrl || message.avatarUrl,
      };
    };

    setPrimaryMessages((prev) => {
      let changed = false;
      const next = prev.map((message) => {
        const patched = patchMessage(message);
        if (patched !== message) changed = true;
        return patched;
      });
      return changed ? next : prev;
    });
    setIrcMessagesByChannel((prev) => {
      let changed = false;
      const next: Record<string, ChatMessage[]> = {};
      for (const [channel, messages] of Object.entries(prev)) {
        const patchedMessages = messages.map((message) => {
          const patched = patchMessage(message);
          if (patched !== message) changed = true;
          return patched;
        });
        next[channel] = patchedMessages;
      }
      return changed ? next : prev;
    });
  }, [applyIrcUserProfile, ircUserProfilesRef, setIrcMessagesByChannel, setPrimaryMessages]);

  const hydrateIrcUserProfile = useCallback(async (userId?: string, usernameHint?: string) => {
    if (!userId || userId.trim() === '') return;
    if (ircProfileInFlightRef.current.has(userId)) return;

    const cached = ircUserProfilesRef.current[userId];
    if (cached?.avatarUrl && cached.avatarUrl.trim() !== '' && cached.displayName && cached.displayName.trim() !== '') {
      return;
    }

    ircProfileInFlightRef.current.add(userId);
    try {
      const response = await fetch(buildApiUrl('/api/chat/user-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          username: usernameHint || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const username = typeof payload?.username === 'string' ? payload.username.trim() : (usernameHint || '').trim();
      const displayName = typeof payload?.display_name === 'string'
        ? payload.display_name.trim()
        : (typeof payload?.displayName === 'string' ? payload.displayName.trim() : '');
      const avatarUrl = typeof payload?.avatar_url === 'string' ? payload.avatar_url : '';
      const profile: IrcUserProfile = {
        username: username || undefined,
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || undefined,
      };
      ircUserProfilesRef.current[userId] = profile;
      applyIrcUserProfile(userId, profile);
    } catch (error) {
      console.error('[ChatSidebar] Failed to hydrate IRC user profile:', error);
    } finally {
      ircProfileInFlightRef.current.delete(userId);
    }
  }, [applyIrcUserProfile, ircProfileInFlightRef, ircUserProfilesRef]);

  return {
    applyIrcUserProfile,
    applyResolvedUserProfile,
    hydrateIrcUserProfile,
  };
};
