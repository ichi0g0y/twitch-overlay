import type { ChatFragment, ChatMessage } from '../../ChatSidebarItem';
import type { DateSeparatorInfo } from '../types';
import { EMOTE_CDN_BASE, HISTORY_DAYS } from './constants';

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
  if (!timestamp) return { key: 'unknown', label: '日時不明' };
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { key: 'unknown', label: '日時不明' };
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return { key: `${yyyy}-${mm}-${dd}`, label: formatDateSeparatorLabel(date) };
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
      if (current) next[duplicateIndex] = mergeChatMessage(current, item);
      continue;
    }

    const index = next.length;
    next.push(item);
    if (messageId !== '' && !messageId.startsWith('irc-')) idToIndex.set(messageId, index);
    if (signature !== '') signatureToIndex.set(signature, index);
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
      const emoteId = typeof emoteIdRaw === 'string' ? emoteIdRaw : undefined;
      const emoteUrlRaw = item.emoteUrl ?? item.emote_url;
      const emoteUrl =
        typeof emoteUrlRaw === 'string'
          ? normalizeEmoteUrl(emoteUrlRaw)
          : emoteId
            ? emoteUrlFromId(emoteId)
            : undefined;
      fragments.push({ type: 'emote', text, emoteId, emoteUrl });
      continue;
    }

    fragments.push({ type: 'text', text });
  }

  return fragments.length > 0 ? fragments : undefined;
};
