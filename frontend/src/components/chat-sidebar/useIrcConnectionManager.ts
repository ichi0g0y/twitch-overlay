import { useEffect, useRef } from 'react';
import type React from 'react';
import { normalizeTwitchChannelName } from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type {
  IrcConnection,
  IrcUserProfile,
} from './types';
import {
  PRIMARY_IRC_CONNECTION_PREFIX,
  primaryIrcConnectionKey,
} from './utils';
import { useIrcSocketLifecycle } from './useIrcSocketLifecycle';

export const useIrcConnectionManager = ({
  activeCustomIrcChannels,
  enablePrimaryConnection,
  primaryCredentialRefreshTick,
  setPrimaryChannelLogin,
  setConnectingChannels,
  setPrimaryMessages,
  ircConnectionsRef,
  ircUserProfilesRef,
  appendIrcMessage,
  upsertIrcParticipant,
  applyIrcNames,
  removeIrcParticipant,
  shouldIgnoreDuplicateIrcLine,
  shouldIgnoreDuplicateIrcMessage,
  persistIrcMessage,
  hydrateIrcUserProfile,
}: {
  activeCustomIrcChannels: string[];
  enablePrimaryConnection: boolean;
  primaryCredentialRefreshTick: number;
  setPrimaryChannelLogin: React.Dispatch<React.SetStateAction<string>>;
  setConnectingChannels: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setPrimaryMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  ircConnectionsRef: React.MutableRefObject<Map<string, IrcConnection>>;
  ircUserProfilesRef: React.MutableRefObject<Record<string, IrcUserProfile>>;
  appendIrcMessage: (channel: string, message: ChatMessage) => void;
  upsertIrcParticipant: (channel: string, payload: {
    userLogin?: string;
    userName?: string;
    userId?: string;
  }) => void;
  applyIrcNames: (channel: string, logins: string[]) => void;
  removeIrcParticipant: (channel: string, userLogin: string) => void;
  shouldIgnoreDuplicateIrcLine: (line: string) => boolean;
  shouldIgnoreDuplicateIrcMessage: (channel: string, message: ChatMessage) => boolean;
  persistIrcMessage: (channel: string, message: ChatMessage) => Promise<void>;
  hydrateIrcUserProfile: (userId?: string, usernameHint?: string) => Promise<void>;
}) => {
  const primaryConnectionRefreshInFlightRef = useRef(false);
  const {
    resolveIrcCredentials,
    startIrcConnection,
    stopIrcConnection,
  } = useIrcSocketLifecycle({
    setConnectingChannels,
    setPrimaryMessages,
    ircConnectionsRef,
    ircUserProfilesRef,
    appendIrcMessage,
    upsertIrcParticipant,
    applyIrcNames,
    removeIrcParticipant,
    shouldIgnoreDuplicateIrcLine,
    shouldIgnoreDuplicateIrcMessage,
    persistIrcMessage,
    hydrateIrcUserProfile,
  });

  useEffect(() => {
    let cancelled = false;

    const ensurePrimaryIrcConnection = async () => {
      const primaryKeys = Array.from(ircConnectionsRef.current.keys())
        .filter((key) => key.startsWith(PRIMARY_IRC_CONNECTION_PREFIX));
      if (!enablePrimaryConnection) {
        setPrimaryChannelLogin('');
        for (const key of primaryKeys) {
          stopIrcConnection(key);
        }
        return;
      }
      if (primaryConnectionRefreshInFlightRef.current) return;
      primaryConnectionRefreshInFlightRef.current = true;

      const credentials = await resolveIrcCredentials();
      try {
        if (cancelled) return;

        const login = normalizeTwitchChannelName(credentials.login ?? '');

        if (!login) {
          setPrimaryChannelLogin('');
          for (const key of primaryKeys) {
            stopIrcConnection(key);
          }
          return;
        }

        const connectionKey = primaryIrcConnectionKey(login);
        setPrimaryChannelLogin((prev) => (prev === login ? prev : login));

        for (const key of primaryKeys) {
          if (key === connectionKey) continue;
          stopIrcConnection(key);
        }

        const existing = ircConnectionsRef.current.get(connectionKey);
        if (existing) {
          if (credentials.authenticated && !existing.authenticated) {
            stopIrcConnection(connectionKey);
            startIrcConnection(login, { connectionKey, isPrimary: true });
          }
          return;
        }

        startIrcConnection(login, { connectionKey, isPrimary: true });
      } finally {
        primaryConnectionRefreshInFlightRef.current = false;
      }
    };

    void ensurePrimaryIrcConnection();

    return () => {
      cancelled = true;
    };
  }, [
    enablePrimaryConnection,
    ircConnectionsRef,
    primaryCredentialRefreshTick,
    resolveIrcCredentials,
    setPrimaryChannelLogin,
    startIrcConnection,
    stopIrcConnection,
  ]);

  useEffect(() => {
    const expected = new Set(activeCustomIrcChannels);
    for (const channel of activeCustomIrcChannels) {
      if (!ircConnectionsRef.current.has(channel)) {
        startIrcConnection(channel);
      }
    }

    for (const channel of Array.from(ircConnectionsRef.current.keys())) {
      if (channel.startsWith(PRIMARY_IRC_CONNECTION_PREFIX)) continue;
      if (!expected.has(channel)) {
        stopIrcConnection(channel);
      }
    }
  }, [
    activeCustomIrcChannels,
    ircConnectionsRef,
    startIrcConnection,
    stopIrcConnection,
  ]);

  useEffect(() => {
    return () => {
      for (const channel of Array.from(ircConnectionsRef.current.keys())) {
        stopIrcConnection(channel);
      }
    };
  }, [ircConnectionsRef, stopIrcConnection]);

  return {
    startIrcConnection,
    stopIrcConnection,
  };
};
