import { normalizeTwitchChannelName } from '../../../utils/chatChannels';
import type { ChatFragment, ChatMessage } from '../../ChatSidebarItem';
import { EMOTE_CDN_BASE, IRC_ANONYMOUS_PASS } from './constants';

const emoteUrlFromId = (id: string) => `${EMOTE_CDN_BASE}/${id}/default/light/2.0`;

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
      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
        continue;
      }
      ranges.push({ start, end, emoteId });
    }
  }

  if (ranges.length === 0) return undefined;
  ranges.sort((a, b) => a.start - b.start);

  const fragments: ChatFragment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      fragments.push({ type: 'text', text: message.slice(cursor, range.start) });
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

  const messageId =
    tags.id || `irc-${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export const parseIrcJoin = (line: string): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ JOIN #([^ ]+)$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

export const parseIrcPart = (line: string): { channel: string; userLogin: string } | null => {
  const match = line.match(/^(?:@[^ ]+ )?:(.+?)![^ ]+ PART #([^ ]+)(?: .*)?$/);
  if (!match) return null;
  const [, rawLogin = '', rawChannel = ''] = match;
  const userLogin = normalizeTwitchChannelName(rawLogin);
  const channel = normalizeTwitchChannelName(rawChannel);
  if (!userLogin || !channel) return null;
  return { channel, userLogin };
};

const createAnonymousNick = () => `justinfan${Math.floor(10000 + Math.random() * 90000)}`;

export const createAnonymousCredentials = (nick?: string) => ({
  authenticated: false,
  nick: nick && nick.trim() !== '' ? nick : createAnonymousNick(),
  pass: IRC_ANONYMOUS_PASS,
});

export const sanitizeIrcMessage = (raw: string) => raw.replace(/\r?\n/g, ' ').trim();

export const isLoginLikeDisplayName = (name: string, channel: string) => {
  const rawName = name.trim().replace(/^[@#]+/, '');
  const normalizedName = normalizeTwitchChannelName(rawName);
  const normalizedChannel = normalizeTwitchChannelName(channel);
  if (!normalizedName || !normalizedChannel) return false;
  if (normalizedName !== normalizedChannel) return false;
  return rawName === normalizedName;
};
