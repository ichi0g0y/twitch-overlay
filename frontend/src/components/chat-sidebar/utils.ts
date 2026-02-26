import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
} from '../../utils/chatChannels';
import type { ChatFragment, ChatMessage } from '../ChatSidebarItem';
import type {
  ChatDisplayMode,
  ChatDisplayModeByTab,
  DateSeparatorInfo,
  MessageOrderReversedByTab,
} from './types';

export const HISTORY_DAYS = 7;
export const COLLAPSE_STORAGE_KEY = 'chat_sidebar_collapsed';
export const ACTIVE_TAB_STORAGE_KEY = 'chat_sidebar_active_tab';
export const MESSAGE_ORDER_REVERSED_STORAGE_KEY =
  'chat_sidebar_message_order_reversed_by_tab';
export const LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY =
  'chat_sidebar_message_order_reversed';
export const CHAT_DISPLAY_MODE_STORAGE_KEY = 'chat_sidebar_display_mode_by_tab';
export const LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY = 'chat_sidebar_display_mode';
export const RESIZE_MIN_WIDTH = 220;
export const RESIZE_MAX_WIDTH = 520;
export const FONT_MIN_SIZE = 12;
export const FONT_MAX_SIZE = 40;
export const EMBED_MIN_WIDTH = 340;
export const EMOTE_CDN_BASE = 'https://static-cdn.jtvnw.net/emoticons/v2';
export const IRC_ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443';
export const IRC_RECONNECT_BASE_DELAY_MS = 2000;
export const IRC_RECONNECT_MAX_DELAY_MS = 20000;
export const IRC_HISTORY_LIMIT = 300;
export const IRC_ANONYMOUS_PASS = 'SCHMOOPIIE';
export const PRIMARY_IRC_CONNECTION_PREFIX = '__primary_irc__';
export const COLLAPSED_DESKTOP_WIDTH = 48;
export const EDGE_RAIL_OFFSET_XL_PX = 64;
export const USER_PROFILE_CACHE_TTL_MS = 30_000;
export const USER_PROFILE_CACHE_INCOMPLETE_TTL_MS = 5_000;
export const DEFAULT_TIMEOUT_SECONDS = 10 * 60;
export const DISPLAY_NAME_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DISPLAY_NAME_REFRESH_TICK_MS = 10 * 60 * 1000;
export const PRIMARY_IRC_CREDENTIAL_REFRESH_MS = 15 * 1000;
export const IVR_TWITCH_USER_ENDPOINT = 'https://api.ivr.fi/v2/twitch/user';
export const IVR_BADGES_GLOBAL_ENDPOINT =
  'https://api.ivr.fi/v2/twitch/badges/global';
export const IVR_BADGES_CHANNEL_ENDPOINT =
  'https://api.ivr.fi/v2/twitch/badges/channel';

export const primaryIrcConnectionKey = (login: string) =>
  `${PRIMARY_IRC_CONNECTION_PREFIX}${login}`;

export const formatTime = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const formatDateSeparatorLabel = (date: Date) =>
  date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

export const resolveDateSeparatorInfo = (timestamp?: string): DateSeparatorInfo => {
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

export const trimMessagesByAge = (items: ChatMessage[]) => {
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

export const dedupeMessages = (items: ChatMessage[]) => {
  const idToIndex = new Map<string, number>();
  const signatureToIndex = new Map<string, number>();
  const next: ChatMessage[] = [];

  for (const item of items) {
    const messageId = (item.messageId || '').trim();
    // 署名ベースの重複チェック（常に適用 — 異なるmessageIdフォーマット間の重複を検出）
    const actor = (item.username || item.userId || '').trim().toLowerCase();
    const body = (item.message || '').trim().replace(/\s+/g, ' ');
    const parsedTs = item.timestamp ? new Date(item.timestamp).getTime() : Number.NaN;
    const timeBucket = Number.isNaN(parsedTs)
      ? ''
      : String(Math.floor(parsedTs / 1000));
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

export const normalizeFragments = (raw: any): ChatFragment[] | undefined => {
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
      const emoteId =
        typeof emoteIdRaw === 'string' ? emoteIdRaw : undefined;
      const emoteUrlRaw = item.emoteUrl ?? item.emote_url;
      const emoteUrl =
        typeof emoteUrlRaw === 'string'
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

const parseEmoteFragments = (
  message: string,
  emotesTag?: string,
): ChatFragment[] | undefined => {
  if (!emotesTag || !message) return undefined;

  const ranges: Array<{ start: number; end: number; emoteId: string }> = [];
  for (const emoteEntry of emotesTag.split('/')) {
    const [emoteId, positions] = emoteEntry.split(':');
    if (!emoteId || !positions) continue;

    for (const range of positions.split(',')) {
      const [rawStart, rawEnd] = range.split('-');
      const start = Number.parseInt(rawStart, 10);
      const end = Number.parseInt(rawEnd, 10);
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end < start
      )
        continue;
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

export const parseIrcPrivmsg = (
  line: string,
): { channel: string; userLogin: string; message: ChatMessage } | null => {
  const match = line.match(
    /^(?:@([^ ]+) )?(?::([^ ]+) )?PRIVMSG #([^ ]+) :(.*)$/,
  );
  if (!match) return null;

  const [, rawTags = '', rawPrefix = '', rawChannel = '', rawMessage = ''] =
    match;
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

  const messageId =
    tags.id ||
    `irc-${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export const parseIrcNamesReply = (
  line: string,
): { channel: string; logins: string[] } | null => {
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

export const parseIrcJoin = (
  line: string,
): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ JOIN #([^ ]+)$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

export const parseIrcPart = (
  line: string,
): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ PART #([^ ]+)(?: .*)?$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

const createAnonymousNick = () =>
  `justinfan${Math.floor(10000 + Math.random() * 90000)}`;

export const createAnonymousCredentials = (nick?: string) => ({
  authenticated: false,
  nick: nick && nick.trim() !== '' ? nick : createAnonymousNick(),
  pass: IRC_ANONYMOUS_PASS,
});

export const sanitizeIrcMessage = (raw: string) =>
  raw.replace(/\r?\n/g, ' ').trim();

export const isLoginLikeDisplayName = (name: string, channel: string) => {
  const rawName = name.trim().replace(/^[@#]+/, '');
  const normalizedName = normalizeTwitchChannelName(rawName);
  const normalizedChannel = normalizeTwitchChannelName(channel);
  if (!normalizedName || !normalizedChannel) return false;
  if (normalizedName !== normalizedChannel) return false;
  return rawName === normalizedName;
};

export const readStoredActiveTab = (): string => {
  if (typeof window === 'undefined') return PRIMARY_CHAT_TAB_ID;
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored && stored.trim() !== '' ? stored : PRIMARY_CHAT_TAB_ID;
};

export const readStoredMessageOrderReversedByTab =
  (): MessageOrderReversedByTab => {
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
    if (
      window.localStorage.getItem(LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY) ===
      'true'
    ) {
      return { [PRIMARY_CHAT_TAB_ID]: true };
    }
    return {};
  };

export const resolveDefaultChatDisplayMode = (
  tabId: string,
): ChatDisplayMode => (tabId === PRIMARY_CHAT_TAB_ID ? 'custom' : 'embed');

export const readStoredChatDisplayModeByTab = (): ChatDisplayModeByTab => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(CHAT_DISPLAY_MODE_STORAGE_KEY);
  if (raw && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalized: ChatDisplayModeByTab = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key !== 'string' || key.trim() === '') continue;
          if (value === 'custom' || value === 'embed') {
            normalized[key] = value;
          }
        }
        return normalized;
      }
    } catch {
      // ignore malformed payload and fall back
    }
  }

  const legacy = window.localStorage.getItem(LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY);
  if (legacy === 'custom' || legacy === 'embed') {
    return { [PRIMARY_CHAT_TAB_ID]: legacy };
  }
  return {};
};
