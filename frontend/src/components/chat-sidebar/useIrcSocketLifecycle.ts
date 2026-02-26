import { useCallback } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import { normalizeTwitchChannelName } from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type {
  IrcConnection,
  IrcCredentialsResponse,
  IrcUserProfile,
  ResolvedIrcCredentials,
} from './types';
import {
  IRC_ENDPOINT,
  IRC_RECONNECT_BASE_DELAY_MS,
  IRC_RECONNECT_MAX_DELAY_MS,
  createAnonymousCredentials,
  dedupeMessages,
  parseIrcJoin,
  parseIrcNamesReply,
  parseIrcPart,
  parseIrcPrivmsg,
  trimMessagesByAge,
} from './utils';

export const useIrcSocketLifecycle = ({
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
  const setChannelConnecting = useCallback((channel: string, connecting: boolean) => {
    setConnectingChannels((prev) => ({ ...prev, [channel]: connecting }));
  }, [setConnectingChannels]);

  const resolveIrcCredentials = useCallback(async (fallbackNick?: string): Promise<ResolvedIrcCredentials> => {
    try {
      const response = await fetch(buildApiUrl('/api/chat/irc/credentials'));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: IrcCredentialsResponse | null = await response.json().catch(() => null);
      const authenticated = payload?.authenticated === true;
      const nick = typeof payload?.nick === 'string' ? payload.nick.trim() : '';
      const pass = typeof payload?.pass === 'string' ? payload.pass.trim() : '';
      const login = typeof payload?.login === 'string' ? (normalizeTwitchChannelName(payload.login) ?? '') : '';
      if (authenticated && nick !== '' && pass !== '') {
        return {
          authenticated: true,
          nick,
          pass,
          login,
          userId: typeof payload?.user_id === 'string' ? payload.user_id.trim() : '',
          displayName: typeof payload?.display_name === 'string' ? payload.display_name.trim() : nick,
        };
      }
    } catch (error) {
      console.warn('[ChatSidebar] Failed to resolve IRC credentials. Falling back to anonymous:', error);
    }
    return { ...createAnonymousCredentials(fallbackNick), login: '', userId: '', displayName: '' };
  }, []);

  const attachIrcSocket = useCallback((connection: IrcConnection) => {
    if (connection.stopped) return;

    connection.generation += 1;
    const currentGeneration = connection.generation;
    setChannelConnecting(connection.channel, true);
    const connect = async () => {
      const credentials = await resolveIrcCredentials(connection.nick);
      if (connection.stopped) {
        setChannelConnecting(connection.channel, false);
        return;
      }
      if (currentGeneration !== connection.generation) {
        return;
      }
      connection.authenticated = credentials.authenticated;
      connection.nick = credentials.nick;
      connection.pass = credentials.pass;
      connection.userId = credentials.userId;
      connection.login = credentials.login;
      connection.displayName = credentials.displayName;

      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      const ws = new WebSocket(IRC_ENDPOINT);
      connection.ws = ws;

      ws.onopen = () => {
        if (connection.stopped || connection.ws !== ws || currentGeneration !== connection.generation) return;
        connection.reconnectAttempts = 0;
        setChannelConnecting(connection.channel, false);
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
        ws.send(`PASS ${connection.pass}`);
        ws.send(`NICK ${connection.nick}`);
        ws.send(`JOIN #${connection.channel}`);
      };

      ws.onmessage = (event) => {
        if (connection.stopped || connection.ws !== ws || currentGeneration !== connection.generation) return;
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;
        for (const line of raw.split('\r\n')) {
          if (!line) continue;
          if (line.startsWith('PING')) {
            ws.send(line.replace(/^PING/, 'PONG'));
            continue;
          }
          if (shouldIgnoreDuplicateIrcLine(line)) {
            continue;
          }

          const namesReply = parseIrcNamesReply(line);
          if (namesReply && namesReply.channel === connection.channel) {
            applyIrcNames(connection.channel, namesReply.logins);
            continue;
          }

          const joinEvent = parseIrcJoin(line);
          if (joinEvent && joinEvent.channel === connection.channel) {
            upsertIrcParticipant(connection.channel, {
              userLogin: joinEvent.userLogin,
              userName: joinEvent.userLogin,
            });
            continue;
          }

          const partEvent = parseIrcPart(line);
          if (partEvent && partEvent.channel === connection.channel) {
            removeIrcParticipant(connection.channel, partEvent.userLogin);
            continue;
          }

          const parsed = parseIrcPrivmsg(line);
          if (!parsed || parsed.channel !== connection.channel) continue;
          if (shouldIgnoreDuplicateIrcMessage(connection.channel, parsed.message)) {
            continue;
          }

          const profile = parsed.message.userId ? ircUserProfilesRef.current[parsed.message.userId] : undefined;
          const mergedMessage: ChatMessage = profile
            ? {
              ...parsed.message,
              username: profile.username || parsed.message.username,
              displayName: profile.displayName || parsed.message.displayName,
              avatarUrl: profile.avatarUrl || parsed.message.avatarUrl,
            }
            : parsed.message;

          if (connection.isPrimary) {
            setPrimaryMessages((prev) => dedupeMessages(trimMessagesByAge([...prev, mergedMessage])));
          } else {
            appendIrcMessage(connection.channel, mergedMessage);
            void persistIrcMessage(connection.channel, mergedMessage);
          }
          upsertIrcParticipant(connection.channel, {
            userLogin: parsed.userLogin,
            userName: mergedMessage.displayName || mergedMessage.username,
            userId: mergedMessage.userId,
          });
          void hydrateIrcUserProfile(mergedMessage.userId, mergedMessage.username);
        }
      };

      ws.onclose = () => {
        if (connection.stopped || connection.ws !== ws || currentGeneration !== connection.generation) return;
        connection.ws = null;

        setChannelConnecting(connection.channel, true);
        const delay = Math.min(
          IRC_RECONNECT_BASE_DELAY_MS * (2 ** connection.reconnectAttempts),
          IRC_RECONNECT_MAX_DELAY_MS,
        );
        connection.reconnectAttempts += 1;

        connection.reconnectTimer = setTimeout(() => {
          attachIrcSocket(connection);
        }, delay);
      };

      ws.onerror = () => {
        // onclose handler takes care of reconnect.
      };
    };

    void connect();
  }, [
    appendIrcMessage,
    applyIrcNames,
    hydrateIrcUserProfile,
    ircUserProfilesRef,
    persistIrcMessage,
    removeIrcParticipant,
    resolveIrcCredentials,
    setChannelConnecting,
    setPrimaryMessages,
    shouldIgnoreDuplicateIrcLine,
    shouldIgnoreDuplicateIrcMessage,
    upsertIrcParticipant,
  ]);

  const stopIrcConnection = useCallback((channel: string) => {
    const connection = ircConnectionsRef.current.get(channel);
    if (!connection) return;

    connection.stopped = true;
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }

    if (connection.ws) {
      connection.ws.close();
      connection.ws = null;
    }
    connection.generation += 1;

    ircConnectionsRef.current.delete(channel);
    setConnectingChannels((prev) => {
      if (!(channel in prev)) return prev;
      const next = { ...prev };
      delete next[channel];
      return next;
    });
  }, [ircConnectionsRef, setConnectingChannels]);

  const startIrcConnection = useCallback(async (
    channel: string,
    options: { connectionKey?: string; isPrimary?: boolean } = {},
  ) => {
    const connectionKey = options.connectionKey ?? channel;
    const isPrimary = options.isPrimary ?? false;
    if (ircConnectionsRef.current.has(connectionKey)) return;
    const anonymousCredentials = createAnonymousCredentials();

    const connection: IrcConnection = {
      channel,
      isPrimary,
      ws: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      stopped: false,
      nick: anonymousCredentials.nick,
      pass: anonymousCredentials.pass,
      authenticated: false,
      generation: 0,
      userId: '',
      displayName: '',
      login: '',
    };

    ircConnectionsRef.current.set(connectionKey, connection);
    attachIrcSocket(connection);
  }, [attachIrcSocket, ircConnectionsRef]);

  return {
    resolveIrcCredentials,
    startIrcConnection,
    stopIrcConnection,
  };
};
