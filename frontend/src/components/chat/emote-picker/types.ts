export type Emote = {
  id: string;
  name: string;
  url: string;
  source: 'channel' | 'special' | 'unlocked' | 'global' | 'learned';
  channelLogin?: string;
  usable: boolean;
  emoteType?: string;
  tier?: string;
};

export type EmoteGroup = {
  id: string;
  label: string;
  source: 'channel' | 'special' | 'unlocked' | 'global' | 'learned';
  channelLogin?: string;
  channelAvatarUrl?: string;
  priority: boolean;
  emotes: Emote[];
};

export type EmoteBucket = 'free' | 'tier1' | 'tier2' | 'tier3' | 'unlock' | 'other';

export type EmoteSection = {
  key: string;
  label: string;
  emotes: Emote[];
};

export type EmoteSubSection = {
  key: string;
  label: string;
  emotes: Emote[];
};

export type RenderGroup = EmoteGroup & {
  sections: EmoteSection[];
  loading: boolean;
};

export type EmotePickerProps = {
  disabled?: boolean;
  channelLogins?: string[];
  priorityChannelLogin?: string;
  onSelect: (name: string, url: string) => void;
  triggerClassName?: string;
  triggerVariant?: 'outline' | 'ghost';
};

export type StoredEmoteCacheEntry = {
  savedAt: number;
  groups: unknown[];
};

export type StoredEmoteCache = Record<string, StoredEmoteCacheEntry>;
