import type { EmoteGroup } from './types';

const cloneGroup = (group: EmoteGroup): EmoteGroup => {
  return { ...group, emotes: [...group.emotes] };
};

export const mergeGroupsIntoGroupCache = (
  cache: Record<string, EmoteGroup>,
  groups: EmoteGroup[],
) => {
  for (const group of groups) {
    if (!group.id) continue;
    cache[group.id] = cloneGroup(group);
  }
};

export const pickSeedGroupsFromCache = (
  cache: Record<string, EmoteGroup>,
  requestChannel: string,
  priorityChannel: string,
): EmoteGroup[] => {
  const selected: EmoteGroup[] = [];
  const seen = new Set<string>();
  const include = (groupId: string) => {
    if (groupId === '' || seen.has(groupId)) return;
    const group = cache[groupId];
    if (!group) return;
    selected.push(cloneGroup(group));
    seen.add(groupId);
  };

  for (const group of Object.values(cache)) {
    if (group.source !== 'channel') include(group.id);
  }

  if (priorityChannel !== '') include(`channel:${priorityChannel}`);
  if (requestChannel !== '') include(`channel:${requestChannel}`);

  return selected;
};

export const collectMissingGroupIds = (requestChannel: string, groups: EmoteGroup[]): string[] => {
  const existingIds = new Set(groups.map((group) => group.id));
  const missing: string[] = [];

  if (!existingIds.has('global')) missing.push('global');
  if (!existingIds.has('unlocked')) missing.push('unlocked');
  if (requestChannel !== '') {
    const channelGroupId = `channel:${requestChannel}`;
    if (!existingIds.has(channelGroupId)) missing.push(channelGroupId);
  }

  return missing;
};

export const buildLoadingGroup = (groupId: string): EmoteGroup | null => {
  if (groupId === 'global') {
    return {
      id: 'global',
      label: 'グローバル',
      source: 'global',
      priority: false,
      emotes: [],
    };
  }
  if (groupId === 'unlocked') {
    return {
      id: 'unlocked',
      label: 'アンロック済み',
      source: 'unlocked',
      priority: false,
      emotes: [],
    };
  }
  if (groupId.startsWith('channel:')) {
    const channelLogin = groupId.slice('channel:'.length).trim().toLowerCase();
    if (channelLogin === '') return null;
    return {
      id: groupId,
      label: `#${channelLogin}`,
      source: 'channel',
      channelLogin,
      priority: false,
      emotes: [],
    };
  }
  return null;
};
