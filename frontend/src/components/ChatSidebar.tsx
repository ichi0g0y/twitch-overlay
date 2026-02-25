import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, MessageCircle, Plus, Send, Settings, Users, X } from 'lucide-react';

import { buildApiUrl } from '../utils/api';
import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
  readIrcChannels,
  subscribeIrcChannels,
  writeIrcChannels,
} from '../utils/chatChannels';
import { getWebSocketClient } from '../utils/websocket';
import { ChattersPanel, type ChattersPanelChatter } from './ChattersPanel';
import { ChatFragment, ChatMessage, ChatSidebarItem } from './ChatSidebarItem';
import { EmotePicker } from './chat/EmotePicker';
import { RichChatInput, type RichChatInputRef } from './chat/RichChatInput';
import { type InputFragment } from './chat/chatInputUtils';
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
  activeTabRequest?: {
    tabId: string;
    requestId: number;
  } | null;
  onActiveTabChange?: (tabId: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  translationEnabled: boolean;
  onTranslationToggle: (enabled: boolean) => void;
  notificationOverwrite: boolean;
  onNotificationModeToggle: (enabled: boolean) => void;
};

type IrcConnection = {
  channel: string;
  isPrimary: boolean;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  stopped: boolean;
  nick: string;
  pass: string;
  authenticated: boolean;
  generation: number;
  userId: string;
  login: string;
  displayName: string;
};

type IrcUserProfile = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

type IrcCredentialsResponse = {
  authenticated?: boolean;
  nick?: string;
  pass?: string;
  login?: string;
  user_id?: string;
  display_name?: string;
};

type IrcChannelDisplayProfile = {
  channel_login?: string;
  display_name?: string;
  updated_at?: number;
};

type IrcParticipant = {
  userId?: string;
  userLogin: string;
  userName: string;
  lastSeenAt: number;
};

type ResolvedIrcCredentials = {
  authenticated: boolean;
  nick: string;
  pass: string;
  login: string;
  userId: string;
  displayName: string;
};

type MessageOrderReversedByTab = Record<string, boolean>;

type DateSeparatorInfo = {
  key: string;
  label: string;
};

type ChatDisplayItem =
  | {
    type: 'date-separator';
    key: string;
    label: string;
  }
  | {
    type: 'message';
    key: string;
    message: ChatMessage;
    index: number;
  };

type UserInfoPopupState = {
  message: ChatMessage;
  tabId: string;
};

type ChatUserProfileDetail = {
  userId: string;
  username: string;
  avatarUrl: string;
  displayName: string;
  login: string;
  description: string;
  userType: string;
  broadcasterType: string;
  profileImageUrl: string;
  coverImageUrl: string;
  followerCount: number | null;
  viewCount: number;
  createdAt: string;
  canTimeout: boolean;
  canBlock: boolean;
};

type CachedUserProfileDetail = {
  profile: ChatUserProfileDetail;
  fetchedAt: number;
};

type BadgeVisual = {
  imageUrl: string;
  label: string;
};

type IvrBadgeVersion = {
  id?: string;
  title?: string;
  description?: string;
  image_url_1x?: string;
  image_url_2x?: string;
  image_url_4x?: string;
};

type IvrBadgeSet = {
  set_id?: string;
  versions?: IvrBadgeVersion[];
};

const HISTORY_DAYS = 7;
const COLLAPSE_STORAGE_KEY = 'chat_sidebar_collapsed';
const ACTIVE_TAB_STORAGE_KEY = 'chat_sidebar_active_tab';
const MESSAGE_ORDER_REVERSED_STORAGE_KEY = 'chat_sidebar_message_order_reversed_by_tab';
const LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY = 'chat_sidebar_message_order_reversed';
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
const PRIMARY_IRC_CONNECTION_PREFIX = '__primary_irc__';
const COLLAPSED_DESKTOP_WIDTH = 48;
const EDGE_RAIL_OFFSET_XL_PX = 64;
const USER_PROFILE_CACHE_TTL_MS = 30_000;
const USER_PROFILE_CACHE_INCOMPLETE_TTL_MS = 5_000;
const DEFAULT_TIMEOUT_SECONDS = 10 * 60;
const DISPLAY_NAME_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DISPLAY_NAME_REFRESH_TICK_MS = 10 * 60 * 1000;
const IVR_TWITCH_USER_ENDPOINT = 'https://api.ivr.fi/v2/twitch/user';
const IVR_BADGES_GLOBAL_ENDPOINT = 'https://api.ivr.fi/v2/twitch/badges/global';
const IVR_BADGES_CHANNEL_ENDPOINT = 'https://api.ivr.fi/v2/twitch/badges/channel';

const primaryIrcConnectionKey = (login: string) => `${PRIMARY_IRC_CONNECTION_PREFIX}${login}`;

const formatTime = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const formatDateSeparatorLabel = (date: Date) => (
  date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
);

const resolveDateSeparatorInfo = (timestamp?: string): DateSeparatorInfo => {
  if (!timestamp) {
    return { key: 'unknown', label: '日時不明' };
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { key: 'unknown', label: '日時不明' };
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return {
    key: `${yyyy}-${mm}-${dd}`,
    label: formatDateSeparatorLabel(date),
  };
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

const pickPreferredFragments = (current?: ChatFragment[], incoming?: ChatFragment[]) => {
  if (!current || current.length === 0) return incoming;
  if (!incoming || incoming.length === 0) return current;
  const currentHasEmote = current.some((fragment) => fragment.type === 'emote');
  const incomingHasEmote = incoming.some((fragment) => fragment.type === 'emote');
  if (!currentHasEmote && incomingHasEmote) return incoming;
  return current;
};

const mergeBadgeKeys = (current?: string[], incoming?: string[]) => {
  const merged = new Set<string>();
  for (const key of current ?? []) {
    const normalized = key.trim();
    if (normalized !== '') merged.add(normalized);
  }
  for (const key of incoming ?? []) {
    const normalized = key.trim();
    if (normalized !== '') merged.add(normalized);
  }
  return merged.size > 0 ? Array.from(merged) : undefined;
};

const mergeChatMessage = (current: ChatMessage, incoming: ChatMessage): ChatMessage => ({
  ...current,
  messageId: current.messageId || incoming.messageId,
  userId: current.userId || incoming.userId,
  username: current.username || incoming.username,
  displayName: current.displayName || incoming.displayName,
  message: current.message || incoming.message,
  badgeKeys: mergeBadgeKeys(current.badgeKeys, incoming.badgeKeys),
  fragments: pickPreferredFragments(current.fragments, incoming.fragments),
  avatarUrl: current.avatarUrl || incoming.avatarUrl,
  translation: current.translation || incoming.translation,
  translationStatus: current.translationStatus || incoming.translationStatus,
  translationLang: current.translationLang || incoming.translationLang,
  timestamp: current.timestamp || incoming.timestamp,
});

const dedupeMessages = (items: ChatMessage[]) => {
  const idToIndex = new Map<string, number>();
  const signatureToIndex = new Map<string, number>();
  const next: ChatMessage[] = [];

  for (const item of items) {
    const messageId = (item.messageId || '').trim();
    // 署名ベースの重複チェック（常に適用 — 異なるmessageIdフォーマット間の重複を検出）
    const actor = (item.username || item.userId || '').trim().toLowerCase();
    const body = (item.message || '').trim().replace(/\s+/g, ' ');
    const parsedTs = item.timestamp ? new Date(item.timestamp).getTime() : Number.NaN;
    const timeBucket = Number.isNaN(parsedTs) ? '' : String(Math.floor(parsedTs / 1000));
    const signature = actor !== '' && body !== '' ? `${actor}|${body}|${timeBucket}` : '';

    let duplicateIndex: number | undefined;
    if (messageId !== '' && !messageId.startsWith('irc-')) {
      duplicateIndex = idToIndex.get(messageId);
    }
    if (duplicateIndex === undefined && signature !== '') {
      duplicateIndex = signatureToIndex.get(signature);
    }

    if (duplicateIndex !== undefined) {
      const current = next[duplicateIndex];
      if (current) {
        next[duplicateIndex] = mergeChatMessage(current, item);
      }
      continue;
    }

    const index = next.length;
    next.push(item);
    // IDベースの重複チェック（irc-以外のmessageIdがある場合）
    if (messageId !== '' && !messageId.startsWith('irc-')) {
      idToIndex.set(messageId, index);
    }
    if (signature !== '') {
      signatureToIndex.set(signature, index);
    }
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

const parseBadgeKeys = (badgesTag?: string): string[] | undefined => {
  if (!badgesTag) return undefined;
  const keys = new Set<string>();
  for (const rawEntry of badgesTag.split(',')) {
    const entry = rawEntry.trim();
    if (entry === '') continue;
    const [setIdRaw, versionRaw = ''] = entry.split('/');
    const setId = setIdRaw.trim();
    const version = versionRaw.trim();
    if (setId === '') continue;
    keys.add(version === '' ? setId : `${setId}/${version}`);
  }
  return keys.size > 0 ? Array.from(keys) : undefined;
};

const parseIrcPrivmsg = (line: string): { channel: string; userLogin: string; message: ChatMessage } | null => {
  const match = line.match(/^(?:@([^ ]+) )?(?::([^ ]+) )?PRIVMSG #([^ ]+) :(.*)$/);
  if (!match) return null;

  const [, rawTags = '', rawPrefix = '', rawChannel = '', rawMessage = ''] = match;
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!channel) return null;

  const tags = parseIrcTags(rawTags);
  const loginFromPrefix = rawPrefix.split('!')[0] || '';
  const normalizedLogin = normalizeTwitchChannelName(loginFromPrefix) || '';
  const username = normalizedLogin || loginFromPrefix || channel;
  const displayName = tags['display-name'] || loginFromPrefix || username;
  const userId = tags['user-id'] || undefined;
  const timestampMillis = Number.parseInt(tags['tmi-sent-ts'] || '', 10);
  const timestamp = Number.isNaN(timestampMillis)
    ? new Date().toISOString()
    : new Date(timestampMillis).toISOString();

  const messageId = tags.id || `irc-${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const badgeKeys = parseBadgeKeys(tags.badges);
  const fragments = parseEmoteFragments(rawMessage, tags.emotes);

  return {
    channel,
    userLogin: normalizedLogin,
    message: {
      id: messageId,
      messageId,
      userId,
      username,
      displayName,
      message: rawMessage,
      badgeKeys,
      fragments,
      timestamp,
    },
  };
};

const parseIrcNamesReply = (line: string): { channel: string; logins: string[] } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:[^ ]+ 353 [^ ]+ [=*@] #([^ ]+) :(.*)$/);
  if (!match) return null;

  const [, rawChannel = '', rawNames = ''] = match;
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!channel) return null;
  const logins = rawNames
    .split(' ')
    .map((name) => name.trim().replace(/^[~&@%+]+/, ''))
    .map((name) => normalizeTwitchChannelName(name) || '')
    .filter((name) => name !== '');
  return { channel, logins: Array.from(new Set(logins)) };
};

const parseIrcJoin = (line: string): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ JOIN #([^ ]+)$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

const parseIrcPart = (line: string): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ PART #([^ ]+)(?: .*)?$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

const buildOwnOutgoingEchoKey = (channel: string, messageText: string) => {
  const normalizedChannel = normalizeTwitchChannelName(channel) || channel.trim().toLowerCase();
  const normalizedBody = messageText.trim().replace(/\s+/g, ' ');
  return `${normalizedChannel}|${normalizedBody}`;
};

const createAnonymousNick = () => `justinfan${Math.floor(10000 + Math.random() * 90000)}`;

const createAnonymousCredentials = (nick?: string) => ({
  authenticated: false,
  nick: nick && nick.trim() !== '' ? nick : createAnonymousNick(),
  pass: IRC_ANONYMOUS_PASS,
});

const sanitizeIrcMessage = (raw: string) => raw.replace(/\r?\n/g, ' ').trim();

const inputFragmentsToChatFragments = (fragments: InputFragment[], fallbackText: string): ChatFragment[] => {
  const next: ChatFragment[] = [];

  for (const fragment of fragments) {
    if (fragment.type === 'text') {
      if (fragment.text === '') continue;
      const prev = next[next.length - 1];
      if (prev?.type === 'text') {
        prev.text += fragment.text;
      } else {
        next.push({ type: 'text', text: fragment.text });
      }
      continue;
    }

    const emoteName = fragment.text.trim();
    if (emoteName === '') continue;
    next.push({
      type: 'emote',
      text: emoteName,
      emoteUrl: fragment.emoteUrl,
    });
  }

  return next.length > 0 ? next : [{ type: 'text', text: fallbackText }];
};

const isLoginLikeDisplayName = (name: string, channel: string) => {
  const rawName = name.trim().replace(/^[@#]+/, '');
  const normalizedName = normalizeTwitchChannelName(rawName);
  const normalizedChannel = normalizeTwitchChannelName(channel);
  if (!normalizedName || !normalizedChannel) return false;
  if (normalizedName !== normalizedChannel) return false;
  return rawName === normalizedName;
};

const readStoredActiveTab = (): string => {
  if (typeof window === 'undefined') return PRIMARY_CHAT_TAB_ID;
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored && stored.trim() !== '' ? stored : PRIMARY_CHAT_TAB_ID;
};

const readStoredMessageOrderReversedByTab = (): MessageOrderReversedByTab => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY);
  if (raw && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalized: MessageOrderReversedByTab = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key === 'string' && key.trim() !== '' && value === true) {
            normalized[key] = true;
          }
        }
        return normalized;
      }
    } catch {
      // ignore malformed payload and fall back to legacy key
    }
  }

  // 旧フォーマット（単一フラグ）からの移行: メインタブの設定として復元する
  if (window.localStorage.getItem(LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY) === 'true') {
    return { [PRIMARY_CHAT_TAB_ID]: true };
  }
  return {};
};

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  side,
  width,
  onWidthChange,
  avoidEdgeRail = false,
  embedded = false,
  channelDisplayNames = {},
  activeTabRequest = null,
  onActiveTabChange,
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
  const [primaryChannelLogin, setPrimaryChannelLogin] = useState('');

  const listRef = useRef<HTMLDivElement | null>(null);
  const tabScrollerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [resizing, setResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [channelEditorOpen, setChannelEditorOpen] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [channelInputError, setChannelInputError] = useState('');

  const richInputRef = useRef<RichChatInputRef | null>(null);
  const [inputHasContent, setInputHasContent] = useState(false);
  const [postingMessage, setPostingMessage] = useState(false);
  const [postError, setPostError] = useState('');
  const [messageOrderReversedByTab, setMessageOrderReversedByTab] = useState<MessageOrderReversedByTab>(() => readStoredMessageOrderReversedByTab());
  const [chattersOpen, setChattersOpen] = useState(false);
  const [userInfoPopup, setUserInfoPopup] = useState<UserInfoPopupState | null>(null);
  const [rawDataMessage, setRawDataMessage] = useState<ChatMessage | null>(null);
  const [userInfoProfile, setUserInfoProfile] = useState<ChatUserProfileDetail | null>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(false);
  const [userInfoError, setUserInfoError] = useState('');
  const [userModerationLoading, setUserModerationLoading] = useState<'timeout' | 'block' | null>(null);
  const [userModerationMessage, setUserModerationMessage] = useState('');
  const [userInfoIdCopied, setUserInfoIdCopied] = useState(false);
  const [rawDataCopied, setRawDataCopied] = useState(false);
  const ircConnectionsRef = useRef<Map<string, IrcConnection>>(new Map());
  const ircUserProfilesRef = useRef<Record<string, IrcUserProfile>>({});
  const ircParticipantsByChannelRef = useRef<Record<string, Record<string, IrcParticipant>>>({});
  const ircProfileInFlightRef = useRef<Set<string>>(new Set());
  const ircRecentRawLinesRef = useRef<Map<string, number>>(new Map());
  const ircRecentMessageKeysRef = useRef<Map<string, number>>(new Map());
  const ownOutgoingEchoRef = useRef<Map<string, number>>(new Map());
  const primaryRecentEchoKeysRef = useRef<Map<string, { sentAt: number; optimisticId: string }>>(new Map());
  const primaryIrcStartedRef = useRef(false);
  const userProfileDetailCacheRef = useRef<Record<string, CachedUserProfileDetail>>({});
  const userInfoFetchSeqRef = useRef(0);
  const userInfoIdCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawDataCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalBadgeCatalogRef = useRef<Map<string, BadgeVisual>>(new Map());
  const channelBadgeCatalogRef = useRef<Record<string, Map<string, BadgeVisual>>>({});
  const badgeCatalogInFlightRef = useRef<Set<string>>(new Set());
  const tabDisplayNameInFlightRef = useRef<Set<string>>(new Set());
  const [tabDisplayNamesByChannel, setTabDisplayNamesByChannel] = useState<Record<string, string>>({});
  const [tabDisplayNameUpdatedAtByChannel, setTabDisplayNameUpdatedAtByChannel] = useState<Record<string, number>>({});
  const [displayNameRefreshTick, setDisplayNameRefreshTick] = useState(0);
  const [badgeCatalogVersion, setBadgeCatalogVersion] = useState(0);
  const [ircParticipantsVersion, setIrcParticipantsVersion] = useState(0);
  const lastHandledActiveTabRequestIdRef = useRef<number | null>(null);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayNameRefreshTick((current) => current + 1);
    }, DISPLAY_NAME_REFRESH_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
      return { ...prev, [channel]: next };
    });
  }, []);

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
    if (before !== after) {
      changed = true;
    }
    bucket[preferredKey] = next;
    if (legacyIdKey && preferredKey !== legacyIdKey && bucket[legacyIdKey]) {
      delete bucket[legacyIdKey];
      changed = true;
    }
    if (changed) {
      setIrcParticipantsVersion((value) => value + 1);
    }
  }, []);

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
    if (changed) {
      setIrcParticipantsVersion((value) => value + 1);
    }
  }, []);

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
    if (changed) {
      setIrcParticipantsVersion((value) => value + 1);
    }
  }, []);

  const clearIrcParticipants = useCallback((channel: string) => {
    const normalizedChannel = normalizeTwitchChannelName(channel);
    if (!normalizedChannel) return;
    if (ircParticipantsByChannelRef.current[normalizedChannel]) {
      delete ircParticipantsByChannelRef.current[normalizedChannel];
      setIrcParticipantsVersion((value) => value + 1);
    }
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

  const markOwnOutgoingEcho = useCallback((channel: string, messageText: string) => {
    const now = Date.now();
    const ttlMs = 10_000;
    const map = ownOutgoingEchoRef.current;
    for (const [key, timestamp] of map.entries()) {
      if ((now - timestamp) > ttlMs) {
        map.delete(key);
      }
    }
    map.set(buildOwnOutgoingEchoKey(channel, messageText), now);
  }, []);

  const consumeOwnOutgoingEcho = useCallback((connection: IrcConnection, message: ChatMessage) => {
    const selfUserId = connection.userId.trim();
    const normalizedUserName = normalizeTwitchChannelName(message.username || '') || '';
    const isSelf = (selfUserId !== '' && message.userId === selfUserId)
      || (normalizedUserName !== '' && normalizedUserName === normalizeTwitchChannelName(connection.nick));
    if (!isSelf) return false;

    const now = Date.now();
    const ttlMs = 10_000;
    const map = ownOutgoingEchoRef.current;
    for (const [key, timestamp] of map.entries()) {
      if ((now - timestamp) > ttlMs) {
        map.delete(key);
      }
    }
    const echoKey = buildOwnOutgoingEchoKey(connection.channel, message.message || '');
    const sentAt = map.get(echoKey);
    if (typeof sentAt !== 'number') return false;
    map.delete(echoKey);
    return (now - sentAt) < ttlMs;
  }, []);

  const buildPrimaryEchoKey = useCallback((message: ChatMessage) => {
    const actor = (message.userId || message.username || '').trim().toLowerCase();
    const body = message.message.trim().replace(/\s+/g, ' ');
    if (actor === '' || body === '') return '';
    return `${actor}|${body}`;
  }, []);

  const registerPrimaryEchoCandidate = useCallback((message: ChatMessage) => {
    const key = buildPrimaryEchoKey(message);
    if (!key) return;
    primaryRecentEchoKeysRef.current.set(key, {
      sentAt: Date.now(),
      optimisticId: message.id,
    });
  }, [buildPrimaryEchoKey]);

  const consumePrimaryEchoCandidate = useCallback((message: ChatMessage): string | null => {
    const key = buildPrimaryEchoKey(message);
    if (!key) return null;

    const now = Date.now();
    const ttlMs = 10000;
    const recent = primaryRecentEchoKeysRef.current;
    for (const [staleKey, candidate] of recent.entries()) {
      if (now - candidate.sentAt > ttlMs) {
        recent.delete(staleKey);
      }
    }

    const candidate = recent.get(key);
    if (!candidate) return null;

    // 消費型: 1回だけエコー候補を使う
    recent.delete(key);
    if ((now - candidate.sentAt) >= ttlMs) {
      return null;
    }
    return candidate.optimisticId;
  }, [buildPrimaryEchoKey]);

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
          message: message.message,
          badge_keys: message.badgeKeys,
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
            displayName: profile.displayName || message.displayName,
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
  }, []);

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

    if (normalizedLogin === '') {
      return;
    }

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
  }, [applyIrcUserProfile]);

  const hydrateIrcUserProfile = useCallback(async (userId?: string, usernameHint?: string) => {
    if (!userId || userId.trim() === '') return;
    if (ircProfileInFlightRef.current.has(userId)) return;

    const cached = ircUserProfilesRef.current[userId];
    if (
      cached?.avatarUrl
      && cached.avatarUrl.trim() !== ''
      && cached.displayName
      && cached.displayName.trim() !== ''
    ) {
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
  }, [applyIrcUserProfile]);

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

  const buildBadgeCatalog = useCallback((sets: IvrBadgeSet[]) => {
    const catalog = new Map<string, BadgeVisual>();
    for (const set of sets) {
      const setId = (set?.set_id || '').trim().toLowerCase();
      if (setId === '') continue;
      const versions = Array.isArray(set?.versions) ? set.versions : [];
      for (const version of versions) {
        const versionId = (version?.id || '').trim();
        if (versionId === '') continue;
        const imageUrl = (version?.image_url_2x || version?.image_url_4x || version?.image_url_1x || '').trim();
        const title = (version?.title || '').trim();
        const description = (version?.description || '').trim();
        const label = description !== '' ? `${title || setId}: ${description}` : (title || setId);
        catalog.set(`${setId}/${versionId}`, { imageUrl, label });
      }
    }
    return catalog;
  }, []);

  const ensureBadgeCatalog = useCallback(async (channelLogin?: string) => {
    const loadCatalog = async (cacheKey: string, url: string, onSuccess: (catalog: Map<string, BadgeVisual>) => void) => {
      if (badgeCatalogInFlightRef.current.has(cacheKey)) return;
      badgeCatalogInFlightRef.current.add(cacheKey);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const sets = Array.isArray(payload) ? payload as IvrBadgeSet[] : [];
        const catalog = buildBadgeCatalog(sets);
        onSuccess(catalog);
        setBadgeCatalogVersion((v) => v + 1);
      } catch (error) {
        console.warn('[ChatSidebar] Failed to load badge catalog:', error);
      } finally {
        badgeCatalogInFlightRef.current.delete(cacheKey);
      }
    };

    if (globalBadgeCatalogRef.current.size === 0) {
      void loadCatalog('global', IVR_BADGES_GLOBAL_ENDPOINT, (catalog) => {
        globalBadgeCatalogRef.current = catalog;
      });
    }

    const normalizedChannel = normalizeTwitchChannelName(channelLogin || '') || '';
    if (normalizedChannel !== '' && !channelBadgeCatalogRef.current[normalizedChannel]) {
      const url = `${IVR_BADGES_CHANNEL_ENDPOINT}?login=${encodeURIComponent(normalizedChannel)}`;
      void loadCatalog(`channel:${normalizedChannel}`, url, (catalog) => {
        channelBadgeCatalogRef.current[normalizedChannel] = catalog;
      });
    }
  }, [buildBadgeCatalog]);

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
          if (consumeOwnOutgoingEcho(connection, parsed.message)) {
            continue;
          }
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
    persistIrcMessage,
    removeIrcParticipant,
    resolveIrcCredentials,
    consumeOwnOutgoingEcho,
    setChannelConnecting,
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
  }, []);

  const startIrcConnection = useCallback((
    channel: string,
    options: { connectionKey?: string; isPrimary?: boolean } = {},
  ) => {
    const connectionKey = options.connectionKey ?? channel;
    const isPrimary = options.isPrimary ?? false;
    if (ircConnectionsRef.current.has(connectionKey)) return;

    const connection: IrcConnection = {
      channel,
      isPrimary,
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
      login: '',
    };

    ircConnectionsRef.current.set(connectionKey, connection);
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
            username: item.username || '',
            displayName: item.displayName ?? item.display_name,
            message: item.message,
            badgeKeys: Array.isArray(item.badge_keys) ? item.badge_keys.filter((value: unknown): value is string => typeof value === 'string') : undefined,
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
            displayName: data.displayName || data.display_name,
            message: data.message,
            badgeKeys: Array.isArray(data.badge_keys) ? data.badge_keys.filter((value: unknown): value is string => typeof value === 'string') : undefined,
            fragments: normalizeFragments(data.fragments ?? data.fragments_json ?? data.fragmentsJson),
            avatarUrl: data.avatarUrl,
            translation: data.translation,
            translationStatus: data.translationStatus,
            translationLang: data.translationLang,
            timestamp: data.timestamp,
          };
          const optimisticId = consumePrimaryEchoCandidate(nextMessage);
          setPrimaryMessages((prev) => {
            if (optimisticId) {
              const index = prev.findIndex((item) => item.id === optimisticId || item.messageId === optimisticId);
              if (index >= 0) {
                const patched = [...prev];
                patched[index] = mergeChatMessage(patched[index], nextMessage);
                return dedupeMessages(trimMessagesByAge(patched));
              }
            }
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
  }, [consumePrimaryEchoCandidate]);

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
            displayName: item.displayName ?? item.display_name,
            message: item.message || '',
            badgeKeys: Array.isArray(item.badge_keys) ? item.badge_keys.filter((value: unknown): value is string => typeof value === 'string') : undefined,
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
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY, JSON.stringify(messageOrderReversedByTab));
    window.localStorage.removeItem(LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY);
  }, [messageOrderReversedByTab]);

  useEffect(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) return;
    if (ircChannels.includes(activeTab)) return;
    setActiveTab(PRIMARY_CHAT_TAB_ID);
  }, [activeTab, ircChannels]);

  useEffect(() => {
    const request = activeTabRequest;
    if (!request) return;
    if (lastHandledActiveTabRequestIdRef.current === request.requestId) return;

    const requestedTabId = (request.tabId || '').trim();
    if (!requestedTabId) return;

    if (requestedTabId === PRIMARY_CHAT_TAB_ID) {
      lastHandledActiveTabRequestIdRef.current = request.requestId;
      setActiveTab(PRIMARY_CHAT_TAB_ID);
      return;
    }

    const normalizedRequested = normalizeTwitchChannelName(requestedTabId);
    if (!normalizedRequested) return;
    if (!ircChannels.includes(normalizedRequested)) return;
    lastHandledActiveTabRequestIdRef.current = request.requestId;
    setActiveTab(normalizedRequested);
  }, [activeTabRequest, ircChannels]);

  useEffect(() => {
    if (!userInfoPopup && !rawDataMessage) return;
    setUserInfoPopup(null);
    setRawDataMessage(null);
  }, [activeTab, isCollapsed]);

  useEffect(() => {
    setUserInfoIdCopied(false);
    if (userInfoIdCopiedTimerRef.current !== null) {
      clearTimeout(userInfoIdCopiedTimerRef.current);
      userInfoIdCopiedTimerRef.current = null;
    }
  }, [userInfoPopup]);

  useEffect(() => {
    setRawDataCopied(false);
    if (rawDataCopiedTimerRef.current !== null) {
      clearTimeout(rawDataCopiedTimerRef.current);
      rawDataCopiedTimerRef.current = null;
    }
  }, [rawDataMessage]);

  useEffect(() => {
    return () => {
      if (userInfoIdCopiedTimerRef.current !== null) {
        clearTimeout(userInfoIdCopiedTimerRef.current);
        userInfoIdCopiedTimerRef.current = null;
      }
      if (rawDataCopiedTimerRef.current !== null) {
        clearTimeout(rawDataCopiedTimerRef.current);
        rawDataCopiedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!userInfoPopup) {
      setUserInfoProfile(null);
      setUserInfoLoading(false);
      setUserInfoError('');
      setUserModerationLoading(null);
      setUserModerationMessage('');
      return;
    }

    const userId = (userInfoPopup.message.userId || '').trim();
    const loginHint = (userInfoPopup.message.username || '').trim().toLowerCase();
    if (!userId && !loginHint) {
      setUserInfoProfile(null);
      setUserInfoLoading(false);
      setUserInfoError('このコメントにはユーザー識別情報がなく、プロフィールを取得できません。');
      return;
    }

    const cacheKey = userId || `login:${loginHint}`;
    const cached = userProfileDetailCacheRef.current[cacheKey];
    const ttl = cached?.profile.followerCount == null
      ? USER_PROFILE_CACHE_INCOMPLETE_TTL_MS
      : USER_PROFILE_CACHE_TTL_MS;
    const hasFreshCache = !!(cached && (Date.now() - cached.fetchedAt) <= ttl);
    if (hasFreshCache && cached) {
      setUserInfoProfile(cached.profile);
      setUserInfoLoading(true);
    } else {
      setUserInfoProfile(null);
      setUserInfoLoading(true);
    }

    let cancelled = false;
    const seq = ++userInfoFetchSeqRef.current;
    setUserInfoError('');

    const loadUserProfileDetail = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId || undefined,
            username: userInfoPopup.message.username || undefined,
            login: userInfoPopup.message.username || undefined,
            force_refresh: true,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json().catch(() => null);
        const profile: ChatUserProfileDetail = {
          userId: typeof payload?.user_id === 'string' ? payload.user_id : userId,
          username: typeof payload?.username === 'string' ? payload.username : '',
          avatarUrl: typeof payload?.avatar_url === 'string' ? payload.avatar_url : '',
          displayName: typeof payload?.display_name === 'string' ? payload.display_name : '',
          login: typeof payload?.login === 'string' ? payload.login : '',
          description: typeof payload?.description === 'string' ? payload.description : '',
          userType: typeof payload?.user_type === 'string' ? payload.user_type : '',
          broadcasterType: typeof payload?.broadcaster_type === 'string' ? payload.broadcaster_type : '',
          profileImageUrl: typeof payload?.profile_image_url === 'string' ? payload.profile_image_url : '',
          coverImageUrl: typeof payload?.cover_image_url === 'string' ? payload.cover_image_url : '',
          followerCount: typeof payload?.follower_count === 'number' ? payload.follower_count : null,
          viewCount: typeof payload?.view_count === 'number' ? payload.view_count : 0,
          createdAt: typeof payload?.created_at === 'string' ? payload.created_at : '',
          canTimeout: payload?.can_timeout === true || payload?.canTimeout === true,
          canBlock: payload?.can_block === true || payload?.canBlock === true,
        };
        if (cancelled || seq !== userInfoFetchSeqRef.current) {
          return;
        }
        const cacheValue: CachedUserProfileDetail = { profile, fetchedAt: Date.now() };
        userProfileDetailCacheRef.current[cacheKey] = cacheValue;
        if (profile.userId.trim() !== '') {
          userProfileDetailCacheRef.current[profile.userId.trim()] = cacheValue;
        }
        if (profile.login.trim() !== '') {
          userProfileDetailCacheRef.current[`login:${profile.login.trim().toLowerCase()}`] = cacheValue;
        }
        applyResolvedUserProfile(profile);
        setUserInfoProfile(profile);
        setUserInfoLoading(false);
      } catch (error) {
        if (cancelled || seq !== userInfoFetchSeqRef.current) {
          return;
        }
        console.error('[ChatSidebar] Failed to load user profile detail:', error);
        setUserInfoLoading(false);
        setUserInfoError(hasFreshCache ? '最新情報の再取得に失敗しました。' : 'プロフィール取得に失敗しました。');
      }
    };

    void loadUserProfileDetail();

    return () => {
      cancelled = true;
    };
  }, [applyResolvedUserProfile, userInfoPopup]);

  const activeBadgeChannelLogin = useMemo(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) {
      return normalizeTwitchChannelName(primaryChannelLogin || '') || '';
    }
    return normalizeTwitchChannelName(activeTab || '') || '';
  }, [activeTab, primaryChannelLogin]);

  const emotePickerChannelLogins = useMemo(() => {
    const set = new Set<string>();
    const primary = normalizeTwitchChannelName(primaryChannelLogin || '') || '';
    if (primary) {
      set.add(primary);
    }
    for (const channel of ircChannels) {
      const normalized = normalizeTwitchChannelName(channel || '') || '';
      if (normalized) {
        set.add(normalized);
      }
    }
    if (activeBadgeChannelLogin) {
      set.add(activeBadgeChannelLogin);
    }
    return Array.from(set);
  }, [activeBadgeChannelLogin, ircChannels, primaryChannelLogin]);

  useEffect(() => {
    void ensureBadgeCatalog(activeBadgeChannelLogin);
  }, [activeBadgeChannelLogin, ensureBadgeCatalog]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userInfoPopup && !rawDataMessage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserInfoPopup(null);
        setRawDataMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [rawDataMessage, userInfoPopup]);

  useEffect(() => {
    if (isCollapsed) {
      setChattersOpen(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    let cancelled = false;

    const startPrimaryIrcConnection = async () => {
      if (primaryIrcStartedRef.current) return;
      const credentials = await resolveIrcCredentials();
      if (cancelled) return;

      const login = normalizeTwitchChannelName(credentials.login ?? '');
      if (!login) {
        setPrimaryChannelLogin('');
        return;
      }

      setPrimaryChannelLogin(login);
      const connectionKey = primaryIrcConnectionKey(login);
      startIrcConnection(login, { connectionKey, isPrimary: true });
      primaryIrcStartedRef.current = true;
    };

    void startPrimaryIrcConnection();

    return () => {
      cancelled = true;
    };
  }, [resolveIrcCredentials, startIrcConnection]);

  useEffect(() => {
    const expected = new Set(ircChannels);
    for (const channel of ircChannels) {
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
  }, [ircChannels, startIrcConnection, stopIrcConnection]);

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
  }, [ircChannels]);

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
        const isStale = updatedAt <= 0 || ((now - (updatedAt * 1000)) >= DISPLAY_NAME_REFRESH_INTERVAL_MS);
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
    tabDisplayNameUpdatedAtByChannel,
    tabDisplayNamesByChannel,
  ]);

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
  const fallbackChatters = useMemo<ChattersPanelChatter[]>(() => {
    const activeParticipantChannel = activeTab === PRIMARY_CHAT_TAB_ID
      ? (normalizeTwitchChannelName(primaryChannelLogin) || '')
      : (normalizeTwitchChannelName(activeTab) || '');
    const participants = new Map<string, ChattersPanelChatter>();
    if (activeParticipantChannel !== '') {
      const snapshot = ircParticipantsByChannelRef.current[activeParticipantChannel] ?? {};
      for (const participant of Object.values(snapshot)) {
        const userId = (participant.userId || '').trim();
        const userLogin = normalizeTwitchChannelName(participant.userLogin) || '';
        const userName = (participant.userName || '').trim() || userLogin || userId;
        const key = userLogin !== '' ? `login:${userLogin}` : (userId !== '' ? `id:${userId}` : '');
        if (key === '') continue;
        participants.set(key, {
          user_id: userId,
          user_login: userLogin,
          user_name: userName,
        });
      }
    }
    for (const item of activeMessages) {
      const userId = (item.userId || '').trim();
      const userName = (item.displayName || item.username || '').trim();
      const userLogin = normalizeTwitchChannelName(item.username || '') || '';
      const keyById = userId !== '' ? Array.from(participants.entries())
        .find(([, value]) => value.user_id === userId)?.[0]
        : undefined;
      const key = keyById
        || (userLogin !== '' ? `login:${userLogin}` : '')
        || (userId !== '' ? `id:${userId}` : '');
      if (key === '') continue;
      const current = participants.get(key);
      participants.set(key, {
        user_id: userId || current?.user_id || '',
        user_login: userLogin || current?.user_login || '',
        user_name: userName || current?.user_name || userLogin,
      });
    }
    return Array.from(participants.values()).sort((a, b) => a.user_name.localeCompare(b.user_name, 'ja'));
  }, [activeMessages, activeTab, ircParticipantsVersion, primaryChannelLogin]);
  const messageOrderReversed = messageOrderReversedByTab[activeTab] === true;

  const displayedMessages = useMemo(
    () => (messageOrderReversed ? [...activeMessages].reverse() : activeMessages),
    [activeMessages, messageOrderReversed],
  );
  const displayedItems = useMemo<ChatDisplayItem[]>(() => {
    const items: ChatDisplayItem[] = [];
    let previousDateKey = '';
    let messageIndex = 0;

    for (const message of displayedMessages) {
      const dateInfo = resolveDateSeparatorInfo(message.timestamp);
      if (dateInfo.key !== previousDateKey) {
        items.push({
          type: 'date-separator',
          key: `date-${dateInfo.key}-${items.length}`,
          label: dateInfo.label,
        });
        previousDateKey = dateInfo.key;
      }
      items.push({
        type: 'message',
        key: message.id,
        message,
        index: messageIndex,
      });
      messageIndex += 1;
    }
    return items;
  }, [displayedMessages]);

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
      const normalizedChannel = normalizeTwitchChannelName(channel) || channel;
      const presetDisplayName = (
        channelDisplayNames[channel]
        || channelDisplayNames[normalizedChannel]
        || ''
      ).trim();
      const cachedDisplayName = (
        tabDisplayNamesByChannel[channel]
        || tabDisplayNamesByChannel[normalizedChannel]
        || ''
      ).trim();
      const preferredPresetName = isLoginLikeDisplayName(presetDisplayName, normalizedChannel)
        ? ''
        : presetDisplayName;
      const preferredCachedName = isLoginLikeDisplayName(cachedDisplayName, normalizedChannel)
        ? ''
        : cachedDisplayName;
      const displayName = (
        preferredPresetName
        || preferredCachedName
        || presetDisplayName
        || cachedDisplayName
      ).trim();
      return {
        id: channel,
        label: displayName || `#${normalizedChannel}`,
        title: displayName ? `${displayName} (#${normalizedChannel})` : `#${normalizedChannel}`,
        removable: true,
      };
    }),
  ], [channelDisplayNames, ircChannels, tabDisplayNamesByChannel]);
  useEffect(() => {
    const scroller = tabScrollerRef.current;
    const activeButton = tabButtonRefs.current[activeTab];
    if (!scroller || !activeButton) return;
    window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [activeTab, tabs]);
  const popupProfileName = (
    userInfoProfile?.displayName
    || userInfoProfile?.username
    || userInfoPopup?.message.displayName
    || userInfoPopup?.message.username
    || ''
  ).trim();
  const popupProfileLogin = (userInfoProfile?.login || '').trim();
  const popupProfileAvatar = (userInfoProfile?.profileImageUrl || userInfoProfile?.avatarUrl || userInfoPopup?.message.avatarUrl || '').trim();
  const popupProfileCover = (userInfoProfile?.coverImageUrl || '').trim();
  const popupProfileDescription = (userInfoProfile?.description || '').trim();
  const popupChannelLogin = (() => {
    const login = popupProfileLogin.trim().toLowerCase();
    if (login !== '') return login;
    const fallback = (userInfoPopup?.message.username || '').trim().toLowerCase();
    return /^[a-z0-9_]{3,25}$/.test(fallback) ? fallback : '';
  })();
  const popupChannelUrl = popupChannelLogin ? `https://www.twitch.tv/${popupChannelLogin}` : '';
  const userInfoCreatedAtLabel = (() => {
    const raw = (userInfoProfile?.createdAt || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
  })();
  const userInfoFollowerCountLabel = typeof userInfoProfile?.followerCount === 'number'
    ? userInfoProfile.followerCount.toLocaleString()
    : '';
  const userInfoResolvedUserId = ((userInfoProfile?.userId || userInfoPopup?.message.userId || '')).trim();
  const moderationTargetName = (
    userInfoProfile?.displayName
    || userInfoProfile?.username
    || userInfoPopup?.message.displayName
    || userInfoPopup?.message.username
    || userInfoResolvedUserId
    || 'このユーザー'
  ).trim();
  const moderationAllowedOnPopup = userInfoPopup?.tabId === PRIMARY_CHAT_TAB_ID;
  const userInfoCanTimeout = moderationAllowedOnPopup && userInfoProfile?.canTimeout === true && userInfoResolvedUserId !== '';
  const userInfoCanBlock = moderationAllowedOnPopup && userInfoProfile?.canBlock === true && userInfoResolvedUserId !== '';
  const rawDataJson = useMemo(
    () => (rawDataMessage ? JSON.stringify(rawDataMessage, null, 2) : ''),
    [rawDataMessage],
  );
  const copyUserInfoUserId = useCallback(async () => {
    if (userInfoResolvedUserId === '') return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(userInfoResolvedUserId);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = userInfoResolvedUserId;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setUserInfoIdCopied(true);
      if (userInfoIdCopiedTimerRef.current !== null) {
        clearTimeout(userInfoIdCopiedTimerRef.current);
      }
      userInfoIdCopiedTimerRef.current = setTimeout(() => {
        setUserInfoIdCopied(false);
      }, 1200);
    } catch {
      setUserInfoError('ユーザーIDのコピーに失敗しました。');
    }
  }, [userInfoResolvedUserId]);
  const copyRawDataJson = useCallback(async () => {
    if (rawDataJson === '') return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawDataJson);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = rawDataJson;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setRawDataCopied(true);
      if (rawDataCopiedTimerRef.current !== null) {
        clearTimeout(rawDataCopiedTimerRef.current);
      }
      rawDataCopiedTimerRef.current = setTimeout(() => {
        setRawDataCopied(false);
      }, 1200);
    } catch (error) {
      console.error('[ChatSidebar] Failed to copy raw chat message JSON:', error);
    }
  }, [rawDataJson]);
  const runModerationAction = useCallback(async (action: 'timeout' | 'block') => {
    if (userInfoResolvedUserId === '') return;
    if (userModerationLoading) return;
    if (action === 'timeout' && !userInfoCanTimeout) return;
    if (action === 'block' && !userInfoCanBlock) return;

    const confirmMessage = action === 'timeout'
      ? `${moderationTargetName} を10分タイムアウトします。実行しますか？`
      : `${moderationTargetName} をブロックします。実行しますか？`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }

    setUserInfoError('');
    setUserModerationMessage('');
    setUserModerationLoading(action);
    try {
      const response = await fetch(buildApiUrl('/api/chat/moderation/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          user_id: userInfoResolvedUserId,
          duration_seconds: action === 'timeout' ? DEFAULT_TIMEOUT_SECONDS : undefined,
          reason: action === 'timeout' ? 'overlay moderation action' : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const errorText = typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`;
        throw new Error(errorText);
      }
      setUserModerationMessage(action === 'timeout' ? '10分タイムアウトを実行しました。' : 'ブロックを実行しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'モデレーション操作に失敗しました。';
      setUserInfoError(message);
    } finally {
      setUserModerationLoading(null);
    }
  }, [
    moderationTargetName,
    userInfoCanBlock,
    userInfoCanTimeout,
    userInfoResolvedUserId,
    userModerationLoading,
  ]);
  const isPrimaryTab = activeTab === PRIMARY_CHAT_TAB_ID;
  const primaryConnectionId = primaryChannelLogin ? primaryIrcConnectionKey(primaryChannelLogin) : '';

  const resolveBadgeVisual = useCallback((badgeKey: string): BadgeVisual | null => {
    const raw = (badgeKey || '').trim();
    if (raw === '') return null;
    const [setIdRaw, versionRaw = ''] = raw.split('/');
    const setId = setIdRaw.trim().toLowerCase();
    const version = versionRaw.trim();
    if (setId === '') return null;
    const resolvedKey = version !== '' ? `${setId}/${version}` : '';
    const channelCatalog = activeBadgeChannelLogin ? channelBadgeCatalogRef.current[activeBadgeChannelLogin] : undefined;
    const matched = (resolvedKey !== '' ? channelCatalog?.get(resolvedKey) : undefined)
      ?? (resolvedKey !== '' ? globalBadgeCatalogRef.current.get(resolvedKey) : undefined);
    if (matched) return matched;
    return {
      imageUrl: '',
      label: version !== '' ? `${setIdRaw} ${version}` : setIdRaw,
    };
  }, [activeBadgeChannelLogin, badgeCatalogVersion]);

  const sendComment = async () => {
    if (postingMessage) {
      return;
    }

    const inputFragments = richInputRef.current?.getFragments() ?? [];
    const text = richInputRef.current?.getIrcText() ?? '';
    const ircText = sanitizeIrcMessage(text);
    if (!ircText) {
      return;
    }

    setPostError('');
    setPostingMessage(true);
    try {
      const connectionKey = isPrimaryTab ? primaryConnectionId : activeTab;
      if (!connectionKey) {
        throw new Error('メインチャンネルのIRC接続を初期化できませんでした。Twitch認証を確認してください。');
      }

      const connection = ircConnectionsRef.current.get(connectionKey);
      if (!connection?.ws || connection.ws.readyState !== WebSocket.OPEN) {
        throw new Error('IRCが未接続です。接続状態を確認してください。');
      }
      if (!connection.authenticated) {
        throw new Error('IRCが匿名接続です。Twitch認証を確認してください。');
      }
      const targetChannel = connection.channel;
      connection.ws.send(`PRIVMSG #${targetChannel} :${ircText}`);
      const ownProfile = connection.userId ? ircUserProfilesRef.current[connection.userId] : undefined;
      // オプティミスティック表示：送信メッセージを即座にローカル表示
      const optimisticId = `irc-local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        messageId: optimisticId,
        userId: connection.userId || undefined,
        username: ownProfile?.username || connection.login || connection.nick,
        displayName: connection.displayName || ownProfile?.displayName || ownProfile?.username || connection.nick,
        message: ircText,
        fragments: inputFragmentsToChatFragments(inputFragments, ircText),
        avatarUrl: ownProfile?.avatarUrl,
        timestamp: new Date().toISOString(),
      };
      if (connection.userId) {
        void hydrateIrcUserProfile(connection.userId, connection.displayName || connection.nick);
      }
      if (isPrimaryTab) {
        registerPrimaryEchoCandidate(optimisticMessage);
        markOwnOutgoingEcho(targetChannel, ircText);
        setPrimaryMessages((prev) => dedupeMessages(trimMessagesByAge([...prev, optimisticMessage])));
      } else {
        markOwnOutgoingEcho(activeTab, ircText);
        appendIrcMessage(activeTab, optimisticMessage);
        void persistIrcMessage(activeTab, optimisticMessage);
        // 署名を登録してTwitchエコー到着時に重複排除
        shouldIgnoreDuplicateIrcMessage(activeTab, optimisticMessage);
      }

      richInputRef.current?.clear();
      setInputHasContent(false);
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
    clearIrcParticipants(channel);
    setUserInfoPopup((prev) => (prev?.tabId === channel ? null : prev));
  };

  const handleOpenUserInfo = useCallback((message: ChatMessage) => {
    setUserInfoProfile(null);
    setUserInfoLoading(false);
    setUserInfoError('');
    setUserModerationLoading(null);
    setUserModerationMessage('');
    setUserInfoPopup({ message, tabId: activeTab });
  }, [activeTab]);

  const handleCloseUserInfo = useCallback(() => {
    setUserInfoProfile(null);
    setUserInfoLoading(false);
    setUserInfoError('');
    setUserModerationLoading(null);
    setUserModerationMessage('');
    setUserInfoPopup(null);
  }, []);

  const handleOpenRawData = useCallback((message: ChatMessage) => {
    setRawDataMessage(message);
  }, []);

  const handleCloseRawData = useCallback(() => {
    setRawDataMessage(null);
  }, []);

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
                    onClick={() => {
                      setMessageOrderReversedByTab((prev) => {
                        const nextValue = !(prev[activeTab] === true);
                        if (nextValue) {
                          return { ...prev, [activeTab]: true };
                        }
                        if (!(activeTab in prev)) {
                          return prev;
                        }
                        const next = { ...prev };
                        delete next[activeTab];
                        return next;
                      });
                    }}
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
                    onClick={() => setChattersOpen((prev) => !prev)}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition ${
                      chattersOpen
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-500/20 dark:text-blue-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800'
                    }`}
                    aria-label="視聴者一覧を開く"
                    aria-expanded={chattersOpen}
                    title="視聴者一覧"
                  >
                    <Users className="w-4 h-4" />
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
                <div ref={tabScrollerRef} className="flex items-center gap-1 overflow-x-auto">
                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTab;
                    const isConnecting = tab.id !== PRIMARY_CHAT_TAB_ID && connectingChannels[tab.id];
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        title={tab.title}
                        ref={(node) => {
                          tabButtonRefs.current[tab.id] = node;
                        }}
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
                className="flex-1 overflow-y-auto px-0 pb-2 divide-y divide-gray-200/70 dark:divide-gray-700/70 text-left"
              >
                {activeMessages.length === 0 ? (
                  emptyState
                ) : (
                  displayedItems.map((item) => (
                    item.type === 'date-separator' ? (
                      <div
                        key={item.key}
                        className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-gray-600 dark:text-gray-300 bg-gray-100/95 dark:bg-gray-800/95 border-y border-gray-200/80 dark:border-gray-700/80 backdrop-blur-[1px]"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{item.label}</span>
                        </span>
                      </div>
                    ) : (
                      <ChatSidebarItem
                        key={item.key}
                        message={item.message}
                        index={item.index}
                        fontSize={fontSize}
                        metaFontSize={metaFontSize}
                        translationFontSize={translationFontSize}
                        timestampLabel={formatTime(item.message.timestamp)}
                        onUsernameClick={handleOpenUserInfo}
                        onRawDataClick={handleOpenRawData}
                        resolveBadgeVisual={resolveBadgeVisual}
                      />
                    )
                  ))
                )}
              </div>
            <div className="border-t dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/70">
                <div className="flex items-center gap-2">
                  <RichChatInput
                    ref={richInputRef}
                    placeholder={isPrimaryTab
                      ? (primaryChannelLogin ? `#${primaryChannelLogin} に送信...` : 'メインチャンネルに送信...')
                      : `#${activeTab} に送信...`}
                    disabled={postingMessage}
                    onSubmit={() => void sendComment()}
                    onChangeHasContent={setInputHasContent}
                    onChangeText={() => {
                      if (postError) setPostError('');
                    }}
                  />
                  <EmotePicker
                    disabled={postingMessage}
                    channelLogins={emotePickerChannelLogins}
                    priorityChannelLogin={activeBadgeChannelLogin || undefined}
                    onSelect={(name, url) => {
                      richInputRef.current?.insertEmote(name, url);
                      richInputRef.current?.focus();
                      if (postError) setPostError('');
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-9 px-0"
                    aria-label="コメントを投稿"
                    onClick={() => void sendComment()}
                    disabled={postingMessage || !inputHasContent}
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
          <ChattersPanel
            open={chattersOpen && !isCollapsed}
            channelLogin={activeBadgeChannelLogin || undefined}
            fallbackChatters={fallbackChatters}
            onChatterClick={handleOpenUserInfo}
            onClose={() => setChattersOpen(false)}
          />
          {userInfoPopup && !isCollapsed && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  handleCloseUserInfo();
                }
              }}
            >
              <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">ユーザー情報</h3>
                  <div className="flex items-center gap-1">
                    {popupChannelUrl && (
                      <a
                        href={popupChannelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label={`${popupChannelLogin} のチャンネルを開く`}
                        title="チャンネルを開く"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleCloseUserInfo}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="ユーザー情報ポップアップを閉じる"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3 px-4 py-3 text-sm">
                  <div
                    className={`relative overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 ${
                      popupProfileCover ? '' : 'bg-gradient-to-r from-slate-500 to-blue-500'
                    }`}
                  >
                    {popupProfileCover && (
                      <img
                        src={popupProfileCover}
                        alt={`${popupProfileName || userInfoPopup.message.username} cover`}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {!popupProfileCover && <div className="h-24 w-full" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
                      {popupProfileAvatar ? (
                        <img
                          src={popupProfileAvatar}
                          alt={`${popupProfileName || userInfoPopup.message.username} avatar`}
                          className="h-12 w-12 rounded-full border-2 border-white/70 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/70 bg-gray-200 text-base font-semibold text-gray-700">
                          {(popupProfileName || userInfoPopup.message.username || '?').slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0 pb-0.5 text-white">
                        <div className="truncate text-sm font-semibold">{popupProfileName || userInfoPopup.message.username || 'Unknown'}</div>
                        <div className="truncate text-xs text-white/85">{popupProfileLogin ? `@${popupProfileLogin}` : ''}</div>
                      </div>
                    </div>
                  </div>

                  {userInfoLoading && (
                    <p className="text-xs text-blue-600 dark:text-blue-300">プロフィールを取得中...</p>
                  )}
                  {userInfoError && (
                    <p className="text-xs text-amber-600 dark:text-amber-300">{userInfoError}</p>
                  )}
                  {userModerationMessage && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-300">{userModerationMessage}</p>
                  )}
                  {(userInfoCanTimeout || userInfoCanBlock) && (
                    <div className="rounded-md border border-red-200 bg-red-50/70 p-2 dark:border-red-500/40 dark:bg-red-900/20">
                      <p className="mb-2 text-[11px] text-red-700 dark:text-red-200">
                        モデレーション操作（確認ダイアログ後に実行）
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {userInfoCanTimeout && (
                          <button
                            type="button"
                            onClick={() => void runModerationAction('timeout')}
                            disabled={userModerationLoading !== null}
                            className="inline-flex h-7 items-center rounded-md border border-red-300 px-2 text-xs text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/50 dark:text-red-100 dark:hover:bg-red-800/50"
                          >
                            {userModerationLoading === 'timeout' ? '実行中...' : '10分タイムアウト'}
                          </button>
                        )}
                        {userInfoCanBlock && (
                          <button
                            type="button"
                            onClick={() => void runModerationAction('block')}
                            disabled={userModerationLoading !== null}
                            className="inline-flex h-7 items-center rounded-md border border-red-400 px-2 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400 dark:text-red-100 dark:hover:bg-red-800/60"
                          >
                            {userModerationLoading === 'block' ? '実行中...' : 'ブロック'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <table className="w-full text-xs text-gray-600 dark:text-gray-300">
                    <tbody className="[&>tr:not(:last-child)]:border-b [&>tr:not(:last-child)]:border-gray-200/70 dark:[&>tr:not(:last-child)]:border-gray-700/70">
                      <tr>
                        <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">ユーザーID</th>
                        <td className="py-1.5">
                          <div className="flex items-start gap-1">
                            <span className="min-w-0 break-all font-mono">{userInfoResolvedUserId || '不明'}</span>
                            {userInfoResolvedUserId !== '' && (
                              <button
                                type="button"
                                onClick={() => void copyUserInfoUserId()}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                aria-label="ユーザーIDをコピー"
                                title="ユーザーIDをコピー"
                              >
                                {userInfoIdCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">アカウント作成</th>
                        <td className="py-1.5">{userInfoCreatedAtLabel || '不明'}</td>
                      </tr>
                      <tr>
                        <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">フォロワー数</th>
                        <td className="py-1.5">{userInfoFollowerCountLabel || '不明'}</td>
                      </tr>
                      <tr>
                        <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">種別</th>
                        <td className="py-1.5 break-words">
                          {[userInfoProfile?.broadcasterType, userInfoProfile?.userType].filter((v) => v && v.trim() !== '').join(' / ') || '不明'}
                        </td>
                      </tr>
                      <tr>
                        <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">自己紹介</th>
                        <td className="py-1.5 break-words">{popupProfileDescription || '（なし）'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {rawDataMessage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  handleCloseRawData();
                }
              }}
            >
              <div className="flex h-[min(80vh,680px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">コメント生データ</h3>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void copyRawDataJson()}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="コメント生データをコピー"
                      title="コメント生データをコピー"
                    >
                      {rawDataCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      <span>{rawDataCopied ? 'コピー済み' : 'コピー'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseRawData}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="コメント生データモーダルを閉じる"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto bg-gray-50 p-4 dark:bg-gray-950">
                  <pre className="min-h-full whitespace-pre-wrap break-all rounded border border-gray-200 bg-white p-3 font-mono text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                    {rawDataJson}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
