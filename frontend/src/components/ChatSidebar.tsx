import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, MessageCircle, Plus, Send, Settings, X } from 'lucide-react';

import { buildApiUrl } from '../utils/api';
import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
  readIrcChannels,
  subscribeIrcChannels,
  writeIrcChannels,
} from '../utils/chatChannels';
import { getWebSocketClient } from '../utils/websocket';
import { ChatFragment, ChatMessage, ChatSidebarItem } from './ChatSidebarItem';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

type SidebarSide = 'left' | 'right';

type ChatSidebarProps = {
  side: SidebarSide;
  width: number;
  onWidthChange: (width: number) => void;
  avoidEdgeRail?: boolean;
  embedded?: boolean;
  channelDisplayNames?: Record<string, string>;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  translationEnabled: boolean;
  onTranslationToggle: (enabled: boolean) => void;
  notificationOverwrite: boolean;
  onNotificationModeToggle: (enabled: boolean) => void;
};

type IrcConnection = {
  channel: string;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  stopped: boolean;
  nick: string;
  pass: string;
  authenticated: boolean;
  generation: number;
  userId: string;
  displayName: string;
};

type IrcUserProfile = {
  username?: string;
  avatarUrl?: string;
};

type IrcCredentialsResponse = {
  authenticated?: boolean;
  nick?: string;
  pass?: string;
  user_id?: string;
  display_name?: string;
};

const HISTORY_DAYS = 7;
const COLLAPSE_STORAGE_KEY = 'chat_sidebar_collapsed';
const ACTIVE_TAB_STORAGE_KEY = 'chat_sidebar_active_tab';
const MESSAGE_ORDER_REVERSED_STORAGE_KEY = 'chat_sidebar_message_order_reversed';
const RESIZE_MIN_WIDTH = 220;
const RESIZE_MAX_WIDTH = 520;
const FONT_MIN_SIZE = 12;
const FONT_MAX_SIZE = 40;
const EMOTE_CDN_BASE = 'https://static-cdn.jtvnw.net/emoticons/v2';
const IRC_ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443';
const IRC_RECONNECT_BASE_DELAY_MS = 2000;
const IRC_RECONNECT_MAX_DELAY_MS = 20000;
const IRC_HISTORY_LIMIT = 300;
const IRC_ANONYMOUS_PASS = 'SCHMOOPIIE';
const COLLAPSED_DESKTOP_WIDTH = 48;
const EDGE_RAIL_OFFSET_XL_PX = 64;

const formatTime = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const emoteUrlFromId = (id: string) => `${EMOTE_CDN_BASE}/${id}/default/light/2.0`;

const normalizeEmoteUrl = (url: string) => {
  const trimmed = url.trim();
  if (trimmed === '') return trimmed;
  if (!trimmed.includes('/emoticons/v2/')) return trimmed;
  return trimmed.replace('/static/', '/default/');
};

const trimMessagesByAge = (items: ChatMessage[]) => {
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return items.filter((msg) => {
    if (!msg.timestamp) return true;
    const parsed = new Date(msg.timestamp).getTime();
    if (Number.isNaN(parsed)) return true;
    return parsed >= cutoff;
  });
};

const dedupeMessages = (items: ChatMessage[]) => {
  const idSet = new Set<string>();
  const signatureSet = new Set<string>();
  const next: ChatMessage[] = [];
  for (const item of items) {
    const messageId = (item.messageId || '').trim();
    // IDベースの重複チェック（irc-以外のmessageIdがある場合）
    if (messageId !== '' && !messageId.startsWith('irc-')) {
      if (idSet.has(messageId)) continue;
      idSet.add(messageId);
    }
    // 署名ベースの重複チェック（常に適用 — 異なるmessageIdフォーマット間の重複を検出）
    const actor = (item.username || item.userId || '').trim().toLowerCase();
    const body = (item.message || '').trim().replace(/\s+/g, ' ');
    const parsedTs = item.timestamp ? new Date(item.timestamp).getTime() : Number.NaN;
    const timeBucket = Number.isNaN(parsedTs) ? '' : String(Math.floor(parsedTs / 1000));
    const signature = `${actor}|${body}|${timeBucket}`;
    if (actor !== '' && body !== '' && signatureSet.has(signature)) continue;
    if (actor !== '' && body !== '') signatureSet.add(signature);
    next.push(item);
  }
  return next;
};

const normalizeFragments = (raw: any): ChatFragment[] | undefined => {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(source)) return undefined;

  const fragments: ChatFragment[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;

    const type = item.type === 'emote' ? 'emote' : 'text';
    const text = typeof item.text === 'string' ? item.text : '';
    if (type === 'emote') {
      const emoteIdRaw = item.emoteId ?? item.emote_id ?? item?.emote?.id;
      const emoteId = typeof emoteIdRaw === 'string' ? emoteIdRaw : undefined;
      const emoteUrlRaw = item.emoteUrl ?? item.emote_url;
      const emoteUrl = typeof emoteUrlRaw === 'string'
        ? normalizeEmoteUrl(emoteUrlRaw)
        : emoteId
          ? emoteUrlFromId(emoteId)
          : undefined;

      fragments.push({
        type: 'emote',
        text,
        emoteId,
        emoteUrl,
      });
      continue;
    }

    fragments.push({ type: 'text', text });
  }

  return fragments.length > 0 ? fragments : undefined;
};

const decodeIrcTagValue = (value: string): string => {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n');
};

const parseIrcTags = (raw: string): Record<string, string> => {
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    if (!pair) continue;
    const [key, ...rest] = pair.split('=');
    if (!key) continue;
    result[key] = decodeIrcTagValue(rest.join('='));
  }
  return result;
};

const parseEmoteFragments = (message: string, emotesTag?: string): ChatFragment[] | undefined => {
  if (!emotesTag || !message) return undefined;

  const ranges: Array<{ start: number; end: number; emoteId: string }> = [];
  for (const emoteEntry of emotesTag.split('/')) {
    const [emoteId, positions] = emoteEntry.split(':');
    if (!emoteId || !positions) continue;

    for (const range of positions.split(',')) {
      const [rawStart, rawEnd] = range.split('-');
      const start = Number.parseInt(rawStart, 10);
      const end = Number.parseInt(rawEnd, 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) continue;
      ranges.push({ start, end, emoteId });
    }
  }

  if (ranges.length === 0) return undefined;
  ranges.sort((a, b) => a.start - b.start);

  const fragments: ChatFragment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }

    if (range.start > cursor) {
      fragments.push({
        type: 'text',
        text: message.slice(cursor, range.start),
      });
    }

    const emoteText = message.slice(range.start, range.end + 1);
    fragments.push({
      type: 'emote',
      text: emoteText,
      emoteId: range.emoteId,
      emoteUrl: emoteUrlFromId(range.emoteId),
    });
    cursor = range.end + 1;
  }

  if (cursor < message.length) {
    fragments.push({ type: 'text', text: message.slice(cursor) });
  }

  return fragments.length > 0 ? fragments : undefined;
};

const parseIrcPrivmsg = (line: string): { channel: string; message: ChatMessage } | null => {
  const match = line.match(/^(?:@([^ ]+) )?(?::([^ ]+) )?PRIVMSG #([^ ]+) :(.*)$/);
  if (!match) return null;

  const [, rawTags = '', rawPrefix = '', rawChannel = '', rawMessage = ''] = match;
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!channel) return null;

  const tags = parseIrcTags(rawTags);
  const loginFromPrefix = rawPrefix.split('!')[0] || '';
  const username = tags['display-name'] || loginFromPrefix || channel;
  const userId = tags['user-id'] || undefined;
  const timestampMillis = Number.parseInt(tags['tmi-sent-ts'] || '', 10);
  const timestamp = Number.isNaN(timestampMillis)
    ? new Date().toISOString()
    : new Date(timestampMillis).toISOString();

  const messageId = tags.id || `irc-${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fragments = parseEmoteFragments(rawMessage, tags.emotes);

  return {
    channel,
    message: {
      id: messageId,
      messageId,
      userId,
      username,
      message: rawMessage,
      fragments,
      timestamp,
    },
  };
};

const createAnonymousNick = () => `justinfan${Math.floor(10000 + Math.random() * 90000)}`;

const createAnonymousCredentials = (nick?: string) => ({
  authenticated: false,
  nick: nick && nick.trim() !== '' ? nick : createAnonymousNick(),
  pass: IRC_ANONYMOUS_PASS,
});

const sanitizeIrcMessage = (raw: string) => raw.replace(/\r?\n/g, ' ').trim();

const readStoredActiveTab = (): string => {
  if (typeof window === 'undefined') return PRIMARY_CHAT_TAB_ID;
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored && stored.trim() !== '' ? stored : PRIMARY_CHAT_TAB_ID;
};

const readStoredMessageOrderReversed = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY) === 'true';
};

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  side,
  width,
  onWidthChange,
  avoidEdgeRail = false,
  embedded = false,
  channelDisplayNames = {},
  fontSize,
  onFontSizeChange,
  translationEnabled,
  onTranslationToggle,
  notificationOverwrite,
  onNotificationModeToggle,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  });
  const isCollapsed = embedded ? false : collapsed;
  const [primaryMessages, setPrimaryMessages] = useState<ChatMessage[]>([]);
  const [ircChannels, setIrcChannels] = useState<string[]>(() => readIrcChannels());
  const [activeTab, setActiveTab] = useState<string>(() => readStoredActiveTab());
  const [ircMessagesByChannel, setIrcMessagesByChannel] = useState<Record<string, ChatMessage[]>>({});
  const [connectingChannels, setConnectingChannels] = useState<Record<string, boolean>>({});

  const listRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [channelEditorOpen, setChannelEditorOpen] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [channelInputError, setChannelInputError] = useState('');

  const [draftMessage, setDraftMessage] = useState('');
  const [postingMessage, setPostingMessage] = useState(false);
  const [postError, setPostError] = useState('');
  const [messageOrderReversed, setMessageOrderReversed] = useState<boolean>(() => readStoredMessageOrderReversed());
  const ircConnectionsRef = useRef<Map<string, IrcConnection>>(new Map());
  const ircUserProfilesRef = useRef<Record<string, IrcUserProfile>>({});
  const ircProfileInFlightRef = useRef<Set<string>>(new Set());
  const ircRecentRawLinesRef = useRef<Map<string, number>>(new Map());
  const ircRecentMessageKeysRef = useRef<Map<string, number>>(new Map());

  const handleToggle = () => {
    if (embedded) return;
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    resizeStateRef.current = { startX: event.clientX, startWidth: width };
    setResizing(true);
  };

  const setChannelConnecting = useCallback((channel: string, connecting: boolean) => {
    setConnectingChannels((prev) => ({ ...prev, [channel]: connecting }));
  }, []);

  const appendIrcMessage = useCallback((channel: string, message: ChatMessage) => {
    const profile = message.userId ? ircUserProfilesRef.current[message.userId] : undefined;
    const mergedMessage: ChatMessage = profile
      ? {
        ...message,
        username: profile.username || message.username,
        avatarUrl: profile.avatarUrl || message.avatarUrl,
      }
      : message;
    setIrcMessagesByChannel((prev) => {
      const current = prev[channel] ?? [];
      const next = dedupeMessages(trimMessagesByAge([...current, mergedMessage]));
      return { ...prev, [channel]: next };
    });
  }, []);

  const shouldIgnoreDuplicateIrcLine = useCallback((line: string) => {
    const now = Date.now();
    const ttlMs = 2500;
    const recent = ircRecentRawLinesRef.current;
    for (const [key, timestamp] of recent.entries()) {
      if (now - timestamp > ttlMs) {
        recent.delete(key);
      }
    }
    const lastSeen = recent.get(line);
    recent.set(line, now);
    return typeof lastSeen === 'number' && (now - lastSeen) < ttlMs;
  }, []);

  const shouldIgnoreDuplicateIrcMessage = useCallback((channel: string, message: ChatMessage) => {
    const now = Date.now();
    const ttlMs = 3000;
    const recent = ircRecentMessageKeysRef.current;
    for (const [key, timestamp] of recent.entries()) {
      if (now - timestamp > ttlMs) {
        recent.delete(key);
      }
    }

    const msgId = (message.messageId || '').trim();
    let key = '';
    if (msgId !== '' && !msgId.startsWith('irc-')) {
      key = `id|${channel}|${msgId}`;
    } else {
      const actor = (message.username || message.userId || '').trim().toLowerCase();
      const body = message.message.trim().replace(/\s+/g, ' ');
      if (actor === '' || body === '') {
        return false;
      }
      key = `fallback|${channel}|${actor}|${body}`;
    }

    if (key === '') {
      return false;
    }
    const lastSeen = recent.get(key);
    recent.set(key, now);
    return typeof lastSeen === 'number' && (now - lastSeen) < ttlMs;
  }, []);

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
          message: message.message,
          fragments: message.fragments ?? [{ type: 'text', text: message.message }],
          timestamp: message.timestamp,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[ChatSidebar] Failed to persist IRC message:', error);
    }
  }, []);

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
            avatarUrl: profile.avatarUrl || message.avatarUrl,
          };
        });
        next[channel] = nextMessages;
        if (channelUpdated) {
          updated = true;
        }
      }

      return updated ? next : prev;
    });
  }, []);

  const hydrateIrcUserProfile = useCallback(async (userId?: string, usernameHint?: string) => {
    if (!userId || userId.trim() === '') return;
    if (ircProfileInFlightRef.current.has(userId)) return;

    const cached = ircUserProfilesRef.current[userId];
    if (cached?.avatarUrl && cached.avatarUrl.trim() !== '') {
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
      const username = typeof payload?.username === 'string' ? payload.username : usernameHint;
      const avatarUrl = typeof payload?.avatar_url === 'string' ? payload.avatar_url : '';
      const profile: IrcUserProfile = {
        username: username || undefined,
        avatarUrl: avatarUrl || undefined,
      };
      ircUserProfilesRef.current[userId] = profile;
      applyIrcUserProfile(userId, profile);
    } catch (error) {
      console.error('[ChatSidebar] Failed to hydrate IRC user profile:', error);
    } finally {
      ircProfileInFlightRef.current.delete(userId);
    }
  }, [applyIrcUserProfile]);

  const resolveIrcCredentials = useCallback(async (fallbackNick?: string) => {
    try {
      const response = await fetch(buildApiUrl('/api/chat/irc/credentials'));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: IrcCredentialsResponse | null = await response.json().catch(() => null);
      const authenticated = payload?.authenticated === true;
      const nick = typeof payload?.nick === 'string' ? payload.nick.trim() : '';
      const pass = typeof payload?.pass === 'string' ? payload.pass.trim() : '';
      if (authenticated && nick !== '' && pass !== '') {
        return {
          authenticated: true,
          nick,
          pass,
          userId: typeof payload?.user_id === 'string' ? payload.user_id.trim() : '',
          displayName: typeof payload?.display_name === 'string' ? payload.display_name.trim() : nick,
        };
      }
    } catch (error) {
      console.warn('[ChatSidebar] Failed to resolve IRC credentials. Falling back to anonymous:', error);
    }
    return { ...createAnonymousCredentials(fallbackNick), userId: '', displayName: '' };
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
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
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

          const parsed = parseIrcPrivmsg(line);
          if (!parsed || parsed.channel !== connection.channel) continue;
          if (shouldIgnoreDuplicateIrcMessage(connection.channel, parsed.message)) {
            continue;
          }
          appendIrcMessage(connection.channel, parsed.message);
          void hydrateIrcUserProfile(parsed.message.userId, parsed.message.username);
          void persistIrcMessage(connection.channel, parsed.message);
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
    hydrateIrcUserProfile,
    persistIrcMessage,
    resolveIrcCredentials,
    setChannelConnecting,
    shouldIgnoreDuplicateIrcLine,
    shouldIgnoreDuplicateIrcMessage,
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
  }, []);

  const startIrcConnection = useCallback((channel: string) => {
    if (ircConnectionsRef.current.has(channel)) return;

    const connection: IrcConnection = {
      channel,
      ws: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      stopped: false,
      nick: createAnonymousNick(),
      pass: IRC_ANONYMOUS_PASS,
      authenticated: false,
      generation: 0,
      userId: '',
      displayName: '',
    };

    ircConnectionsRef.current.set(channel, connection);
    attachIrcSocket(connection);
  }, [attachIrcSocket]);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const delta = event.clientX - resizeStateRef.current.startX;
      const direction = side === 'left' ? 1 : -1;
      const nextWidth = Math.min(
        RESIZE_MAX_WIDTH,
        Math.max(RESIZE_MIN_WIDTH, resizeStateRef.current.startWidth + delta * direction),
      );
      onWidthChange(nextWidth);
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      setResizing(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onWidthChange, resizing, side]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };

    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [settingsOpen]);

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
            username: item.username,
            message: item.message,
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

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

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
            message: data.message,
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
              ? { ...msg, translation: data.translation, translationStatus: data.translationStatus, translationLang: data.translationLang }
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

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeIrcChannels(ircChannels);
  }, [ircChannels]);

  useEffect(() => {
    const unsubscribe = subscribeIrcChannels((channels) => {
      setIrcChannels((prev) => {
        if (prev.length === channels.length && prev.every((item, idx) => item === channels[idx])) {
          return prev;
        }
        return channels;
      });
    });
    return unsubscribe;
  }, []);

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
            message: item.message || '',
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
  }, [hydrateIrcUserProfile, ircChannels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY, String(messageOrderReversed));
  }, [messageOrderReversed]);

  useEffect(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) return;
    if (ircChannels.includes(activeTab)) return;
    setActiveTab(PRIMARY_CHAT_TAB_ID);
  }, [activeTab, ircChannels]);

  useEffect(() => {
    const expected = new Set(ircChannels);
    for (const channel of ircChannels) {
      if (!ircConnectionsRef.current.has(channel)) {
        startIrcConnection(channel);
      }
    }

    for (const channel of Array.from(ircConnectionsRef.current.keys())) {
      if (!expected.has(channel)) {
        stopIrcConnection(channel);
      }
    }
  }, [ircChannels, startIrcConnection, stopIrcConnection]);

  useEffect(() => {
    return () => {
      for (const channel of Array.from(ircConnectionsRef.current.keys())) {
        stopIrcConnection(channel);
      }
    };
  }, [stopIrcConnection]);

  const activeMessages = useMemo(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) {
      return primaryMessages;
    }
    return ircMessagesByChannel[activeTab] ?? [];
  }, [activeTab, ircMessagesByChannel, primaryMessages]);

  const displayedMessages = useMemo(
    () => (messageOrderReversed ? [...activeMessages].reverse() : activeMessages),
    [activeMessages, messageOrderReversed],
  );

  useEffect(() => {
    if (isCollapsed) return;
    const container = listRef.current;
    if (container) {
      if (messageOrderReversed) {
        container.scrollTop = 0;
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [activeMessages, activeTab, isCollapsed, messageOrderReversed]);

  const asideWidthClass = 'w-full lg:w-[var(--chat-sidebar-width)] xl:w-[var(--chat-sidebar-reserved-width)]';
  const fixedWidthClass = 'w-full lg:w-[var(--chat-sidebar-width)]';
  const collapseIcon = side === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />;
  const expandIcon = <span className="text-xs leading-none">＞</span>;
  const toggleIcon = isCollapsed ? expandIcon : collapseIcon;
  const resizeHandleSideClass = side === 'left' ? 'right-0' : 'left-0';
  const metaFontSize = Math.max(10, fontSize - 2);
  const translationFontSize = Math.max(10, fontSize - 2);
  const fixedSideClass = side === 'left'
    ? (avoidEdgeRail ? 'lg:left-4 xl:left-16' : 'lg:left-4')
    : (avoidEdgeRail ? 'lg:right-4 xl:right-16' : 'lg:right-4');
  const fixedOffsetClass = 'lg:top-6';
  const effectiveSidebarWidth = isCollapsed ? COLLAPSED_DESKTOP_WIDTH : width;
  const reservedSidebarWidth = effectiveSidebarWidth + (avoidEdgeRail ? EDGE_RAIL_OFFSET_XL_PX : 0);
  const sidebarStyle = useMemo(() => ({
    '--chat-sidebar-width': `${effectiveSidebarWidth}px`,
    '--chat-sidebar-reserved-width': `${reservedSidebarWidth}px`,
  } as React.CSSProperties), [effectiveSidebarWidth, reservedSidebarWidth]);
  const asideClass = embedded
    ? 'h-full w-full'
    : `transition-all duration-200 self-start ${asideWidthClass}`;
  const wrapperClass = embedded
    ? 'h-full w-full'
    : `${fixedWidthClass} lg:fixed ${fixedOffsetClass} ${fixedSideClass}`;
  const panelClass = embedded
    ? `h-full bg-white dark:bg-gray-800 border-gray-700 ${side === 'left' ? 'border-r' : 'border-l'} flex flex-col overflow-hidden relative`
    : 'h-[calc(100vh-48px)] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm flex flex-col overflow-hidden relative';

  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
      <MessageCircle className="w-5 h-5 mb-2" />
      <span>コメント待機中</span>
    </div>
  ), []);

  const tabs = useMemo(() => [
    { id: PRIMARY_CHAT_TAB_ID, label: 'メイン', title: 'メインチャンネル', removable: false },
    ...ircChannels.map((channel) => {
      const displayName = (channelDisplayNames[channel] || '').trim();
      return {
        id: channel,
        label: displayName || `#${channel}`,
        title: displayName ? `${displayName} (#${channel})` : `#${channel}`,
        removable: true,
      };
    }),
  ], [channelDisplayNames, ircChannels]);

  const isPrimaryTab = activeTab === PRIMARY_CHAT_TAB_ID;

  const sendComment = async () => {
    const text = draftMessage.trim();
    if (!text || postingMessage) {
      return;
    }

    setPostError('');
    setPostingMessage(true);
    try {
      if (isPrimaryTab) {
        throw new Error('IRCタブを選択してから送信してください。');
      }

      const connection = ircConnectionsRef.current.get(activeTab);
      if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
        throw new Error('IRCが未接続です。接続状態を確認してください。');
      }
      if (!connection.authenticated) {
        throw new Error('IRCが匿名接続です。Twitch認証を確認してください。');
      }
      const ircText = sanitizeIrcMessage(text);
      if (!ircText) {
        throw new Error('投稿メッセージが空です');
      }
      connection.ws.send(`PRIVMSG #${activeTab} :${ircText}`);
      // オプティミスティック表示：送信メッセージを即座にローカル表示
      const optimisticId = `irc-local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        messageId: optimisticId,
        userId: connection.userId || undefined,
        username: connection.displayName || connection.nick,
        message: ircText,
        fragments: [{ type: 'text', text: ircText }],
        timestamp: new Date().toISOString(),
      };
      appendIrcMessage(activeTab, optimisticMessage);
      // 署名を登録してTwitchエコー到着時に重複排除
      shouldIgnoreDuplicateIrcMessage(activeTab, optimisticMessage);

      setDraftMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '投稿に失敗しました';
      setPostError(message);
      console.error('[ChatSidebar] Failed to post comment:', error);
    } finally {
      setPostingMessage(false);
    }
  };

  const handleAddChannel = () => {
    const normalized = normalizeTwitchChannelName(channelInput);
    if (!normalized) {
      setChannelInputError('チャンネル名は英数字/アンダースコア (3-25文字) で入力してください');
      return;
    }

    if (ircChannels.includes(normalized)) {
      setActiveTab(normalized);
      setChannelEditorOpen(false);
      setChannelInput('');
      setChannelInputError('');
      return;
    }

    setIrcChannels((prev) => [...prev, normalized]);
    setActiveTab(normalized);
    setChannelEditorOpen(false);
    setChannelInput('');
    setChannelInputError('');
  };

  const handleRemoveChannel = (channel: string) => {
    setIrcChannels((prev) => prev.filter((item) => item !== channel));
    setIrcMessagesByChannel((prev) => {
      if (!(channel in prev)) return prev;
      const next = { ...prev };
      delete next[channel];
      return next;
    });
    if (activeTab === channel) {
      setActiveTab(PRIMARY_CHAT_TAB_ID);
    }
  };

  return (
    <aside className={asideClass} style={embedded ? undefined : sidebarStyle}>
      <div className={wrapperClass} style={embedded ? undefined : sidebarStyle}>
        <div className={panelClass}>
          {!isCollapsed && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="コメント欄の幅を調整"
                onPointerDown={handleResizeStart}
                className={`absolute top-0 ${resizeHandleSideClass} h-full w-1 cursor-col-resize touch-none`}
              >
                <div className="h-full w-full bg-transparent hover:bg-blue-200/40 dark:hover:bg-blue-500/30 transition-colors" />
              </div>
              <div className="flex items-center border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 relative px-3 py-2 justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">コメント欄</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelEditorOpen((prev) => !prev);
                      setChannelInputError('');
                    }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
                    aria-label="IRCチャンネルを追加"
                    aria-expanded={channelEditorOpen}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageOrderReversed((prev) => !prev)}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition ${
                      messageOrderReversed
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-500/20 dark:text-blue-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800'
                    }`}
                    aria-label={messageOrderReversed ? 'コメント順を下に最新へ戻す' : 'コメント順を上に最新へ変更する'}
                    title={messageOrderReversed ? '上に最新 (ON)' : '下に最新 (OFF)'}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((prev) => !prev)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
                    aria-label="コメント欄の設定を開く"
                    aria-expanded={settingsOpen}
                    ref={settingsButtonRef}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {!embedded && (
                    <button
                      type="button"
                      onClick={handleToggle}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
                      aria-label="コメント欄を閉じる"
                      aria-expanded={!isCollapsed}
                    >
                      {toggleIcon}
                    </button>
                  )}
                </div>
                {settingsOpen && (
                  <div
                    ref={settingsPanelRef}
                    className="absolute right-2 top-10 z-20 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-sm"
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">文字サイズ</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={FONT_MIN_SIZE}
                            max={FONT_MAX_SIZE}
                            value={fontSize}
                            onChange={(event) => onFontSizeChange(Number(event.target.value))}
                            className="flex-1"
                          />
                          <span className="w-8 text-right text-sm text-gray-600 dark:text-gray-300">{fontSize}px</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">翻訳</div>
                        <Switch checked={translationEnabled} onCheckedChange={onTranslationToggle} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">通知上書き</div>
                        <Switch checked={notificationOverwrite} onCheckedChange={onNotificationModeToggle} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-b dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 px-2 py-1">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTab;
                    const isConnecting = tab.id !== PRIMARY_CHAT_TAB_ID && connectingChannels[tab.id];
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        title={tab.title}
                        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs whitespace-nowrap transition ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-100'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {tab.id !== PRIMARY_CHAT_TAB_ID && (
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                        )}
                        <span>{tab.label}</span>
                        {tab.removable && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveChannel(tab.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleRemoveChannel(tab.id);
                              }
                            }}
                            className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-gray-600"
                            aria-label={`#${tab.id} を削除`}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {channelEditorOpen && (
                  <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={channelInput}
                        onChange={(event) => {
                          setChannelInput(event.target.value);
                          if (channelInputError) {
                            setChannelInputError('');
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            handleAddChannel();
                          }
                        }}
                        placeholder="追加するチャンネル名"
                        className="flex-1 h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs"
                      />
                      <Button type="button" size="sm" className="h-8 px-2" onClick={handleAddChannel}>
                        追加
                      </Button>
                    </div>
                    {channelInputError && (
                      <p className="mt-1 text-[11px] text-red-500">{channelInputError}</p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Twitch認証が有効ならユーザー接続し、利用できない場合は匿名接続します
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {isCollapsed ? (
            <button
              type="button"
              onClick={handleToggle}
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
              aria-label="コメント欄を開く"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-[10px] leading-none">開く</span>
            </button>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto px-0 py-2 divide-y divide-gray-200/70 dark:divide-gray-700/70 text-left"
              >
                {activeMessages.length === 0 ? (
                  emptyState
                ) : (
                  displayedMessages.map((msg, index) => (
                    <ChatSidebarItem
                      key={msg.id}
                      message={msg}
                      index={index}
                      fontSize={fontSize}
                      metaFontSize={metaFontSize}
                      translationFontSize={translationFontSize}
                      timestampLabel={formatTime(msg.timestamp)}
                    />
                  ))
                )}
              </div>
            <div className="border-t dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/70">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftMessage}
                    onChange={(event) => {
                      setDraftMessage(event.target.value);
                      if (postError) setPostError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void sendComment();
                      }
                    }}
                    placeholder={isPrimaryTab ? 'コメントを入力...' : `#${activeTab} に送信...`}
                    disabled={postingMessage}
                    className="flex-1 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:focus-visible:ring-blue-600 disabled:opacity-60"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-9 px-0"
                    aria-label="コメントを投稿"
                    onClick={() => void sendComment()}
                    disabled={postingMessage || draftMessage.trim().length === 0}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                {postError && (
                  <p className="mt-1 text-[11px] text-red-500 dark:text-red-300">{postError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
