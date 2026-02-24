import { Smile } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

import { buildApiUrl } from '../../utils/api';
import { Button } from '../ui/button';

type Emote = {
  name: string;
  url: string;
  source: 'channel' | 'global' | 'learned';
  channelLogin?: string;
};

type EmoteGroup = {
  id: string;
  label: string;
  source: 'channel' | 'global' | 'learned';
  channelLogin?: string;
  priority: boolean;
  emotes: Emote[];
};

type EmotePickerProps = {
  disabled?: boolean;
  channelLogins?: string[];
  priorityChannelLogin?: string;
  onSelect: (name: string, url: string) => void;
};

const DASHBOARD_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

const normalizeChannelLogin = (raw: string) => {
  const normalized = raw.trim().replace(/^#/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(normalized)) return '';
  return normalized;
};

const parseEmote = (raw: any): Emote | null => {
  if (!raw || typeof raw !== 'object') return null;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const sourceRaw = typeof raw.source === 'string' ? raw.source : 'global';
  const source = sourceRaw === 'channel' || sourceRaw === 'learned' ? sourceRaw : 'global';
  const channelLogin = typeof raw.channel_login === 'string' ? normalizeChannelLogin(raw.channel_login) : '';

  if (name === '' || url === '') return null;

  return {
    name,
    url,
    source,
    channelLogin: channelLogin || undefined,
  };
};

const sortGroups = (groups: EmoteGroup[], priorityChannelLogin?: string) => {
  const normalizedPriority = priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : '';

  return [...groups].sort((a, b) => {
    const aPriority = a.priority || (normalizedPriority !== '' && a.channelLogin === normalizedPriority);
    const bPriority = b.priority || (normalizedPriority !== '' && b.channelLogin === normalizedPriority);
    const sourceOrder = (source: EmoteGroup['source']) => {
      if (source === 'channel') return 0;
      if (source === 'global') return 1;
      return 2;
    };

    return Number(bPriority) - Number(aPriority)
      || sourceOrder(a.source) - sourceOrder(b.source)
      || a.label.localeCompare(b.label, 'en');
  });
};

const parseEmoteGroupsFromResponse = (raw: any, priorityChannelLogin?: string): EmoteGroup[] => {
  const groupList = raw?.data?.groups;
  if (Array.isArray(groupList)) {
    const groups: EmoteGroup[] = [];
    for (const group of groupList) {
      if (!group || typeof group !== 'object') continue;

      const id = typeof group.id === 'string' ? group.id : '';
      const label = typeof group.label === 'string' ? group.label : '';
      const sourceRaw = typeof group.source === 'string' ? group.source : 'global';
      const source = sourceRaw === 'channel' || sourceRaw === 'learned' ? sourceRaw : 'global';
      const channelLogin = typeof group.channel_login === 'string' ? normalizeChannelLogin(group.channel_login) : '';
      const priority = group.priority === true;

      const emotes = Array.isArray(group.emotes)
        ? group.emotes
          .map(parseEmote)
          .filter((emote): emote is Emote => emote !== null)
          .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        : [];

      if (id === '' || label === '' || emotes.length === 0) continue;

      groups.push({
        id,
        label,
        source,
        channelLogin: channelLogin || undefined,
        priority,
        emotes,
      });
    }

    return sortGroups(groups, priorityChannelLogin);
  }

  const flatList = raw?.data?.emotes;
  if (!Array.isArray(flatList)) return [];

  const emotes = flatList
    .map(parseEmote)
    .filter((emote): emote is Emote => emote !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  if (emotes.length === 0) return [];

  return [{
    id: 'all',
    label: 'すべて',
    source: 'global',
    priority: false,
    emotes,
  }];
};

export const EmotePicker: React.FC<EmotePickerProps> = ({
  disabled = false,
  channelLogins = [],
  priorityChannelLogin,
  onSelect,
}) => {
  const cacheRef = useRef<Record<string, EmoteGroup[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [groups, setGroups] = useState<EmoteGroup[]>([]);

  const normalizedChannels = useMemo(() => {
    const set = new Set<string>();
    for (const channel of channelLogins) {
      const normalized = normalizeChannelLogin(channel);
      if (normalized !== '') {
        set.add(normalized);
      }
    }
    return Array.from(set).sort();
  }, [channelLogins]);

  const normalizedPriorityChannel = useMemo(() => {
    return priorityChannelLogin ? normalizeChannelLogin(priorityChannelLogin) : '';
  }, [priorityChannelLogin]);

  const requestKey = useMemo(() => {
    return `${normalizedPriorityChannel}|${normalizedChannels.join(',')}`;
  }, [normalizedChannels, normalizedPriorityChannel]);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (normalizedChannels.length > 0) {
      params.set('channels', normalizedChannels.join(','));
    }
    if (normalizedPriorityChannel !== '') {
      params.set('priority_channel', normalizedPriorityChannel);
    }

    const queryString = params.toString();
    if (queryString === '') {
      return buildApiUrl('/api/emotes');
    }
    return buildApiUrl(`/api/emotes?${queryString}`);
  }, [normalizedChannels, normalizedPriorityChannel]);

  useEffect(() => {
    setKeyword('');
    setError('');

    const cached = cacheRef.current[requestKey];
    if (cached) {
      setGroups(sortGroups(cached, normalizedPriorityChannel));
      return;
    }

    setGroups([]);
  }, [normalizedPriorityChannel, requestKey]);

  useEffect(() => {
    if (!open || loading || groups.length > 0) return;

    const fetchEmotes = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(requestUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const parsed = parseEmoteGroupsFromResponse(data, normalizedPriorityChannel);
        cacheRef.current[requestKey] = parsed;
        setGroups(parsed);
      } catch (fetchError) {
        console.error('[EmotePicker] Failed to fetch emotes:', fetchError);
        setError('エモート一覧の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    void fetchEmotes();
  }, [groups.length, loading, normalizedPriorityChannel, open, requestKey, requestUrl]);

  const filteredGroups = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (normalizedKeyword === '') return groups;

    return groups
      .map((group) => ({
        ...group,
        emotes: group.emotes.filter((emote) => emote.name.toLowerCase().includes(normalizedKeyword)),
      }))
      .filter((group) => group.emotes.length > 0);
  }, [groups, keyword]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 w-9 px-0"
          aria-label="エモートを選択"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <Smile className="h-4 w-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[360px] rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
        >
          <div className="space-y-2">
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="エモート検索"
              style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
              className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:ring-offset-gray-900 dark:focus-visible:ring-blue-600"
            />

            {loading && (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">読み込み中...</p>
            )}

            {!loading && error !== '' && (
              <p className="py-6 text-center text-xs text-red-500 dark:text-red-300">{error}</p>
            )}

            {!loading && error === '' && filteredGroups.length === 0 && (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">該当するエモートがありません</p>
            )}

            {!loading && error === '' && filteredGroups.length > 0 && (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredGroups.map((group) => (
                  <section key={group.id} className="space-y-1">
                    <div className="sticky top-0 z-10 rounded bg-white/90 px-1 py-0.5 text-[11px] font-semibold text-gray-600 backdrop-blur dark:bg-gray-900/90 dark:text-gray-300">
                      {group.label}
                    </div>
                    <div className="grid grid-cols-9 gap-1">
                      {group.emotes.map((emote) => (
                        <button
                          key={`${group.id}:${emote.name}:${emote.url}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => onSelect(emote.name, emote.url)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-transparent hover:border-gray-300 hover:bg-gray-50 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                          title={emote.name}
                          aria-label={emote.name}
                        >
                          <img src={emote.url} alt={emote.name} className="h-7 w-7 object-contain" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
