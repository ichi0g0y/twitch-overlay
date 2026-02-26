import type { Emote, EmoteBucket, EmoteGroup, EmoteSection, EmoteSubSection } from './types';

const normalizeEmoteType = (value?: string) => {
  return (value ?? '').trim().toLowerCase().replace(/[- ]/g, '_');
};

const parseTier = (value?: string): number | null => {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const classifyEmoteBucket = (emote: Emote): EmoteBucket => {
  const type = normalizeEmoteType(emote.emoteType);

  if (type === 'follower' || type === 'followers') return 'free';
  if (type === 'subscriptions' || type === 'subscription' || type === 'subscriber' || type === 'subscribers') {
    const tier = parseTier(emote.tier);
    if (tier === 1000) return 'tier1';
    if (tier === 2000) return 'tier2';
    if (tier === 3000) return 'tier3';
    return 'other';
  }

  if (
    emote.source === 'special'
    || type === 'reward'
    || type === 'rewards'
    || type === 'channel_points'
    || type === 'channelpoints'
    || type === 'unlock'
    || type === 'unlocked'
    || type === 'bitstier'
    || type === 'bits_tier'
    || type === 'hypetrain'
    || type === 'hype_train'
    || type === 'limitedtime'
    || type === 'limited_time'
    || type === 'prime'
    || type === 'turbo'
    || type === 'twofactor'
  ) {
    return 'unlock';
  }

  if (emote.source === 'unlocked') return 'unlock';
  return 'other';
};

const bucketOrder: EmoteBucket[] = ['free', 'tier1', 'tier2', 'tier3', 'unlock', 'other'];
const bucketMeta: Record<EmoteBucket, Omit<EmoteSection, 'key' | 'emotes'>> = {
  free: { label: 'Free' },
  tier1: { label: 'Tier1' },
  tier2: { label: 'Tier2' },
  tier3: { label: 'Tier3' },
  unlock: { label: 'Unlock/Special' },
  other: { label: 'Other' },
};

export const buildSectionsForGroup = (group: EmoteGroup, emotes: Emote[]): EmoteSection[] => {
  if (group.source === 'global') {
    const sorted = [...emotes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    if (sorted.length === 0) return [];
    return [{ key: 'global', label: 'Global A-Z', emotes: sorted }];
  }

  const bucketed: Record<EmoteBucket, Emote[]> = {
    free: [], tier1: [], tier2: [], tier3: [], unlock: [], other: [],
  };
  for (const emote of emotes) {
    bucketed[classifyEmoteBucket(emote)].push(emote);
  }

  return bucketOrder
    .filter((bucket) => bucketed[bucket].length > 0)
    .map((bucket) => ({
      key: bucket,
      ...bucketMeta[bucket],
      emotes: [...bucketed[bucket]].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    }));
};

const subsectionSortIndex = (sectionKey: string, label: string): number => {
  const freeOrder = ['Follower', 'Free Unlock', 'Free Other'];
  const unlockOrder = ['Prime', 'Turbo', 'Two-Factor', 'Channel Points', 'Reward', 'Bits Tier', 'Hype Train', 'Limited Time', 'Special', 'Unlock'];
  if (sectionKey === 'free') {
    const idx = freeOrder.indexOf(label);
    return idx >= 0 ? idx : 99;
  }
  if (sectionKey === 'unlock') {
    const idx = unlockOrder.indexOf(label);
    return idx >= 0 ? idx : 99;
  }
  return 99;
};

const resolveSubSectionLabel = (sectionKey: string, emote: Emote): string => {
  const type = normalizeEmoteType(emote.emoteType);
  if (sectionKey === 'global') return 'Global';
  if (sectionKey === 'tier1') return 'Tier1';
  if (sectionKey === 'tier2') return 'Tier2';
  if (sectionKey === 'tier3') return 'Tier3';

  if (sectionKey === 'free') {
    if (type === 'follower' || type === 'followers') return 'Follower';
    if (emote.source === 'unlocked') return 'Free Unlock';
    return 'Free Other';
  }

  if (sectionKey === 'unlock') {
    if (type === 'prime') return 'Prime';
    if (type === 'turbo') return 'Turbo';
    if (type === 'twofactor') return 'Two-Factor';
    if (type === 'channel_points' || type === 'channelpoints') return 'Channel Points';
    if (type === 'reward' || type === 'rewards') return 'Reward';
    if (type === 'bitstier' || type === 'bits_tier') return 'Bits Tier';
    if (type === 'hypetrain' || type === 'hype_train') return 'Hype Train';
    if (type === 'limitedtime' || type === 'limited_time') return 'Limited Time';
    if (emote.source === 'special') return 'Special';
    return 'Unlock';
  }

  return 'Other';
};

export const buildSubSectionsForSection = (section: EmoteSection): EmoteSubSection[] => {
  if (section.key === 'global') {
    return [{ key: 'global', label: 'Global', emotes: section.emotes }];
  }

  const byLabel = new Map<string, Emote[]>();
  for (const emote of section.emotes) {
    const label = resolveSubSectionLabel(section.key, emote);
    const current = byLabel.get(label);
    if (current) current.push(emote);
    else byLabel.set(label, [emote]);
  }

  return Array.from(byLabel.entries())
    .sort((a, b) => {
      const orderDiff = subsectionSortIndex(section.key, a[0]) - subsectionSortIndex(section.key, b[0]);
      if (orderDiff !== 0) return orderDiff;
      return a[0].localeCompare(b[0], 'en', { sensitivity: 'base' });
    })
    .map(([label, emotes]) => ({
      key: `${section.key}:${label.toLowerCase().replace(/\s+/g, '_')}`,
      label,
      emotes: [...emotes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    }));
};

export const groupHeaderClass = (group: EmoteGroup): string => {
  if (group.channelLogin) return 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100';
  if (group.source === 'global') return 'bg-slate-200 text-slate-800 dark:bg-slate-700/80 dark:text-slate-100';
  if (group.source === 'unlocked') return 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-100';
  if (group.source === 'special') return 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/70 dark:text-gray-100';
};
