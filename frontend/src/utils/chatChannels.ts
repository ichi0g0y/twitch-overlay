const IRC_CHANNELS_STORAGE_KEY = 'chat_sidebar.irc_channels';
const IRC_CHANNELS_EVENT = 'chat_sidebar:irc_channels_changed';

export const MAX_IRC_CHANNELS = 15;

export const PRIMARY_CHAT_TAB_ID = '__primary__';

export const normalizeTwitchChannelName = (raw: string): string | null => {
  const normalized = raw.trim().toLowerCase().replace(/^#/, '');
  if (!normalized) return null;
  if (!/^[a-z0-9_]{3,25}$/.test(normalized)) return null;
  return normalized;
};

const dedupeChannels = (channels: string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const channel of channels) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    next.push(channel);
    if (next.length >= MAX_IRC_CHANNELS) break;
  }
  return next;
};

export const appendIrcChannel = (
  channels: string[],
  rawChannel: string,
): string[] => {
  const normalized = normalizeTwitchChannelName(rawChannel);
  if (!normalized) return dedupeChannels(channels);

  const current = dedupeChannels(
    channels
      .map((item) => normalizeTwitchChannelName(item))
      .filter((item): item is string => Boolean(item)),
  );
  if (current.includes(normalized)) return current;
  if (current.length >= MAX_IRC_CHANNELS) return current;
  return [...current, normalized];
};

export const readIrcChannels = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(IRC_CHANNELS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((item) => (typeof item === 'string' ? normalizeTwitchChannelName(item) : null))
      .filter((item): item is string => Boolean(item));
    return dedupeChannels(normalized);
  } catch {
    return [];
  }
};

export const writeIrcChannels = (channels: string[]): void => {
  if (typeof window === 'undefined') return;
  const normalized = dedupeChannels(
    channels
      .map((item) => normalizeTwitchChannelName(item))
      .filter((item): item is string => Boolean(item)),
  );
  window.localStorage.setItem(IRC_CHANNELS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<string[]>(IRC_CHANNELS_EVENT, { detail: normalized }));
};

export const subscribeIrcChannels = (handler: (channels: string[]) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const customListener = (event: Event) => {
    const next = (event as CustomEvent<string[]>).detail;
    if (Array.isArray(next)) {
      handler(next);
      return;
    }
    handler(readIrcChannels());
  };

  const storageListener = (event: StorageEvent) => {
    if (event.key !== IRC_CHANNELS_STORAGE_KEY) return;
    handler(readIrcChannels());
  };

  window.addEventListener(IRC_CHANNELS_EVENT, customListener as EventListener);
  window.addEventListener('storage', storageListener);

  return () => {
    window.removeEventListener(IRC_CHANNELS_EVENT, customListener as EventListener);
    window.removeEventListener('storage', storageListener);
  };
};
