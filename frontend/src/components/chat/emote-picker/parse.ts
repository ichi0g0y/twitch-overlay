import type { Emote, EmoteGroup } from './types';

export const normalizeChannelLogin = (raw: string) => {
  const normalized = raw.trim().replace(/^#/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(normalized)) return '';
  return normalized;
};

const resolveContextUsable = (usableFromServer?: boolean) => {
  return usableFromServer ?? true;
};

const parseEmote = (raw: any): Emote | null => {
  if (!raw || typeof raw !== 'object') return null;

  const rawId = typeof raw.id === 'string' ? raw.id : (typeof raw.emote_id === 'string' ? raw.emote_id : '');
  const id = rawId.trim();
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const sourceRaw = typeof raw.source === 'string' ? raw.source : 'global';
  const source = sourceRaw === 'channel' || sourceRaw === 'special' || sourceRaw === 'unlocked' || sourceRaw === 'learned'
    ? sourceRaw
    : 'global';
  const rawChannelLogin = typeof raw.channel_login === 'string'
    ? raw.channel_login
    : (typeof raw.channelLogin === 'string' ? raw.channelLogin : '');
  const channelLogin = rawChannelLogin ? normalizeChannelLogin(rawChannelLogin) : '';
  const usableFromServer = typeof raw.usable === 'boolean'
    ? raw.usable
    : (typeof raw.is_usable === 'boolean' ? raw.is_usable : undefined);
  const rawEmoteType = typeof raw.emote_type === 'string'
    ? raw.emote_type
    : (typeof raw.emoteType === 'string' ? raw.emoteType : '');
  const emoteType = rawEmoteType.trim();
  const tier = typeof raw.tier === 'string' ? raw.tier.trim() : '';

  if (name === '' || url === '') return null;

  return {
    id,
    name,
    url,
    source,
    channelLogin: channelLogin || undefined,
    usable: resolveContextUsable(usableFromServer),
    emoteType: emoteType || undefined,
    tier: tier || undefined,
  };
};

export const sortGroups = (groups: EmoteGroup[], priorityChannelLogin?: string) => {
  const normalizedPriority = priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : '';

  return [...groups].sort((a, b) => {
    const aPriority = a.priority || (normalizedPriority !== '' && a.channelLogin === normalizedPriority);
    const bPriority = b.priority || (normalizedPriority !== '' && b.channelLogin === normalizedPriority);
    const sourceOrder = (source: EmoteGroup['source']) => {
      if (source === 'channel') return 0;
      if (source === 'special') return 1;
      if (source === 'unlocked') return 2;
      if (source === 'global') return 3;
      return 4;
    };

    return Number(bPriority) - Number(aPriority)
      || sourceOrder(a.source) - sourceOrder(b.source)
      || a.label.localeCompare(b.label, 'en');
  });
};

export const parseEmoteGroupsFromResponse = (raw: any, priorityChannelLogin?: string): EmoteGroup[] => {
  const groupList = raw?.data?.groups;
  if (Array.isArray(groupList)) {
    const groups: EmoteGroup[] = [];
    for (const group of groupList) {
      if (!group || typeof group !== 'object') continue;

      const id = typeof group.id === 'string' ? group.id : '';
      const label = typeof group.label === 'string' ? group.label : '';
      const sourceRaw = typeof group.source === 'string' ? group.source : 'global';
      const source = sourceRaw === 'channel' || sourceRaw === 'special' || sourceRaw === 'unlocked' || sourceRaw === 'learned'
        ? sourceRaw
        : 'global';
      const rawChannelLogin = typeof group.channel_login === 'string'
        ? group.channel_login
        : (typeof group.channelLogin === 'string' ? group.channelLogin : '');
      const channelLogin = rawChannelLogin ? normalizeChannelLogin(rawChannelLogin) : '';
      const rawChannelAvatarUrl = typeof group.channel_avatar_url === 'string'
        ? group.channel_avatar_url
        : (typeof group.channelAvatarUrl === 'string' ? group.channelAvatarUrl : '');
      const channelAvatarUrl = rawChannelAvatarUrl.trim();
      const priority = group.priority === true;

      const emotes = Array.isArray(group.emotes)
        ? group.emotes
          .map((emote) => parseEmote(emote))
          .filter((emote): emote is Emote => emote !== null)
        : [];

      if (id === '' || label === '' || emotes.length === 0) continue;

      groups.push({
        id,
        label,
        source,
        channelLogin: channelLogin || undefined,
        channelAvatarUrl: channelAvatarUrl || undefined,
        priority,
        emotes,
      });
    }

    return sortGroups(groups, priorityChannelLogin);
  }

  const flatList = raw?.data?.emotes;
  if (!Array.isArray(flatList)) return [];

  const emotes = flatList
    .map((emote) => parseEmote(emote))
    .filter((emote): emote is Emote => emote !== null);

  if (emotes.length === 0) return [];

  return [{
    id: 'all',
    label: 'すべて',
    source: 'global',
    priority: false,
    emotes,
  }];
};
