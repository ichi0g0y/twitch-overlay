import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, X } from 'lucide-react';

import { buildApiUrl } from '../utils/api';
import type { ChatMessage } from './ChatSidebarItem';

type ChattersPanelProps = {
  open: boolean;
  channelLogin?: string;
  fallbackChatters?: ChattersPanelChatter[];
  onChatterClick?: (message: ChatMessage) => void;
  onClose: () => void;
};

export type ChattersPanelChatter = {
  user_id: string;
  user_login: string;
  user_name: string;
};

type ChattersResponse = {
  data?: unknown;
  count?: number;
  total?: number;
};

type HydratedChatterProfile = {
  userId: string;
  userLogin: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number | null;
};

const SCOPE_MISSING_MESSAGE = '視聴者一覧の取得には moderator:read:chatters 権限が必要です。再認証後にお試しください。';
const PROFILE_HYDRATION_MAX = 200;
const PROFILE_HYDRATION_CONCURRENCY = 6;
const PROFILE_HYDRATION_RETRY_MAX = 2;

const formatFollowerTooltip = (displayName: string, followerCount: number | null) => {
  const followerLabel = typeof followerCount === 'number'
    ? followerCount.toLocaleString('ja-JP')
    : '不明';
  return `${displayName} - フォロワー: ${followerLabel}`;
};

const chatterProfileKey = (chatter: ChattersPanelChatter) => {
  const userId = chatter.user_id.trim();
  if (userId !== '') return `id:${userId}`;
  const login = chatter.user_login.trim().toLowerCase();
  if (login !== '') return `login:${login}`;
  return `name:${chatter.user_name.trim().toLowerCase()}`;
};

export const ChattersPanel: React.FC<ChattersPanelProps> = ({
  open,
  channelLogin,
  fallbackChatters,
  onChatterClick,
  onClose,
}) => {
  const [chatters, setChatters] = useState<ChattersPanelChatter[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hydratedProfiles, setHydratedProfiles] = useState<Record<string, HydratedChatterProfile>>({});
  const profileHydrationInFlightRef = useRef<Set<string>>(new Set());
  const profileHydrationAttemptRef = useRef<Record<string, number>>({});
  const [hydratingProfileKeys, setHydratingProfileKeys] = useState<Record<string, true>>({});
  const [visibleProfileKeys, setVisibleProfileKeys] = useState<Record<string, true>>({});
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const setRowRef = useCallback((key: string, node: HTMLLIElement | null) => {
    if (node) {
      rowRefs.current[key] = node;
      return;
    }
    delete rowRefs.current[key];
  }, []);

  const chatterRows = useMemo(
    () => chatters.map((chatter) => ({ key: chatterProfileKey(chatter), chatter })),
    [chatters],
  );

  const hydratingCount = useMemo(
    () => Object.keys(hydratingProfileKeys).length,
    [hydratingProfileKeys],
  );

  useEffect(() => {
    if (!open) return;

    const normalizedChannelLogin = (channelLogin || '').trim().toLowerCase();
    let cancelled = false;
    const loadChatters = async () => {
      setLoading(true);
      setError('');

      try {
        const endpoint = normalizedChannelLogin === ''
          ? '/api/twitch/chatters'
          : `/api/twitch/chatters?channel_login=${encodeURIComponent(normalizedChannelLogin)}`;
        const response = await fetch(buildApiUrl(endpoint));
        if (!response.ok) {
          if (response.status === 403) {
            const fallbackRows = Array.isArray(fallbackChatters) ? fallbackChatters : [];
            if (fallbackRows.length > 0) {
              if (cancelled) return;
              setChatters(fallbackRows);
              setTotal(fallbackRows.length);
              setNotice('Twitch APIの権限不足のため、IRCで観測できた参加者のみ表示しています。');
              return;
            }
            if (normalizedChannelLogin !== '') {
              throw new Error(`@${normalizedChannelLogin} の視聴者一覧は取得できません（モデレーター権限またはスコープ不足）。`);
            }
            throw new Error(SCOPE_MISSING_MESSAGE);
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const payload: ChattersResponse | null = await response.json().catch(() => null);
        const rows = Array.isArray(payload?.data)
          ? payload.data.filter((item): item is ChattersPanelChatter => (
            !!item
            && typeof item === 'object'
            && typeof (item as ChattersPanelChatter).user_id === 'string'
            && typeof (item as ChattersPanelChatter).user_login === 'string'
            && typeof (item as ChattersPanelChatter).user_name === 'string'
          ))
          : [];
        const nextTotal = typeof payload?.total === 'number'
          ? payload.total
          : (typeof payload?.count === 'number' ? payload.count : rows.length);
        if (cancelled) return;
        setChatters(rows);
        setTotal(nextTotal);
        setNotice('');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '視聴者一覧の取得に失敗しました。';
        setChatters([]);
        setTotal(null);
        setError(message);
        setNotice('');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadChatters();
    return () => {
      cancelled = true;
    };
  }, [channelLogin, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || notice === '') return;
    const fallbackRows = Array.isArray(fallbackChatters) ? fallbackChatters : [];
    setChatters(fallbackRows);
    setTotal(fallbackRows.length);
  }, [fallbackChatters, notice, open]);

  useEffect(() => {
    if (!open) return;
    profileHydrationAttemptRef.current = {};
  }, [channelLogin, open]);

  useEffect(() => {
    if (!open) {
      setVisibleProfileKeys({});
      return;
    }
    if (chatterRows.length === 0) {
      setVisibleProfileKeys({});
      return;
    }

    const listElement = listContainerRef.current;
    if (!listElement || typeof IntersectionObserver === 'undefined') {
      const initialKeys: Record<string, true> = {};
      for (const { key } of chatterRows.slice(0, PROFILE_HYDRATION_CONCURRENCY * 4)) {
        initialKeys[key] = true;
      }
      setVisibleProfileKeys(initialKeys);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      setVisibleProfileKeys((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const key = target.dataset.profileKey || '';
          if (key === '') continue;
          if (entry.isIntersecting) {
            if (!(key in next)) {
              next[key] = true;
              changed = true;
            }
            continue;
          }
          if (key in next) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, {
      root: listElement,
      rootMargin: '96px 0px 192px 0px',
      threshold: 0.01,
    });

    const initialKeys: Record<string, true> = {};
    for (const { key } of chatterRows.slice(0, PROFILE_HYDRATION_CONCURRENCY * 4)) {
      initialKeys[key] = true;
    }
    setVisibleProfileKeys(initialKeys);

    for (const { key } of chatterRows) {
      const node = rowRefs.current[key];
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
    };
  }, [chatterRows, open]);

  useEffect(() => {
    if (!open || chatterRows.length === 0) return;

    const inFlightCount = profileHydrationInFlightRef.current.size;
    const availableSlots = Math.max(0, PROFILE_HYDRATION_CONCURRENCY - inFlightCount);
    if (availableSlots <= 0) return;

    const queue = chatterRows
      .filter(({ key }) => !(key in hydratedProfiles))
      .filter(({ key }) => !profileHydrationInFlightRef.current.has(key))
      .filter(({ key }) => (profileHydrationAttemptRef.current[key] || 0) < PROFILE_HYDRATION_RETRY_MAX)
      .sort((a, b) => {
        const aVisible = a.key in visibleProfileKeys ? 0 : 1;
        const bVisible = b.key in visibleProfileKeys ? 0 : 1;
        return aVisible - bVisible;
      })
      .slice(0, Math.min(PROFILE_HYDRATION_MAX, availableSlots));
    if (queue.length === 0) return;

    for (const { key } of queue) {
      profileHydrationInFlightRef.current.add(key);
    }
    setHydratingProfileKeys((prev) => {
      const next = { ...prev };
      for (const { key } of queue) {
        next[key] = true;
      }
      return next;
    });

    for (const { key, chatter } of queue) {
      void (async () => {
        let succeeded = false;
        try {
          const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: chatter.user_id || undefined,
              username: chatter.user_login || chatter.user_name || undefined,
              login: chatter.user_login || undefined,
            }),
          });
          if (!response.ok) {
            return;
          }

          const payload = await response.json().catch(() => null);
          const userId = typeof payload?.user_id === 'string' ? payload.user_id.trim() : chatter.user_id.trim();
          const userLogin = typeof payload?.login === 'string'
            ? payload.login.trim().toLowerCase()
            : chatter.user_login.trim().toLowerCase();
          const displayName = typeof payload?.display_name === 'string' && payload.display_name.trim() !== ''
            ? payload.display_name.trim()
            : (typeof payload?.username === 'string' && payload.username.trim() !== ''
              ? payload.username.trim()
              : chatter.user_name.trim());
          const profileImageUrl = typeof payload?.profile_image_url === 'string'
            ? payload.profile_image_url.trim()
            : '';
          const avatarUrl = profileImageUrl || (
            typeof payload?.avatar_url === 'string'
              ? payload.avatar_url.trim()
              : ''
          );
          const followerCount = typeof payload?.follower_count === 'number'
            ? payload.follower_count
            : null;
          const profile: HydratedChatterProfile = {
            userId,
            userLogin,
            displayName,
            avatarUrl,
            followerCount,
          };

          succeeded = true;
          delete profileHydrationAttemptRef.current[key];
          setHydratedProfiles((prev) => {
            const nextProfiles = { ...prev, [key]: profile };
            if (profile.userId !== '') {
              nextProfiles[`id:${profile.userId}`] = profile;
            }
            if (profile.userLogin !== '') {
              nextProfiles[`login:${profile.userLogin}`] = profile;
            }
            return nextProfiles;
          });
        } catch {
          // ignore hydration errors for individual users
        } finally {
          if (!succeeded) {
            const currentAttempt = profileHydrationAttemptRef.current[key] || 0;
            profileHydrationAttemptRef.current[key] = currentAttempt + 1;
          }
          profileHydrationInFlightRef.current.delete(key);
          setHydratingProfileKeys((prev) => {
            if (!(key in prev)) return prev;
            const nextProfiles = { ...prev };
            delete nextProfiles[key];
            return nextProfiles;
          });
        }
      })();
    }
  }, [chatterRows, hydratedProfiles, open, visibleProfileKeys]);

  const headlineCount = useMemo(() => {
    if (typeof total === 'number') return total;
    return chatters.length;
  }, [chatters.length, total]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Users className="h-4 w-4" />
            {`視聴者一覧 (${headlineCount}人)`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="視聴者一覧を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listContainerRef} className="max-h-[60vh] overflow-y-auto px-4 py-3 text-sm">
          {!loading && !error && hydratingCount > 0 && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {`プロフィールを補完中... (${hydratingCount}件)`}
            </p>
          )}
          {loading && (
            <p className="text-xs text-blue-600 dark:text-blue-300">視聴者一覧を取得中...</p>
          )}
          {!loading && !error && notice && (
            <p className="mb-2 text-xs text-amber-600 dark:text-amber-300">{notice}</p>
          )}
          {!loading && error && (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              {error}
            </p>
          )}
          {!loading && !error && chatters.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">現在表示できる視聴者はいません。</p>
          )}
          {!loading && !error && chatters.length > 0 && (
            <ul className="divide-y divide-gray-200/70 dark:divide-gray-700/70">
              {chatterRows.map(({ key, chatter }) => {
                const profile = hydratedProfiles[key];
                const userLogin = (profile?.userLogin || chatter.user_login || '').trim().toLowerCase();
                const displayName = (profile?.displayName || chatter.user_name || userLogin || 'Unknown').trim();
                const avatarUrl = (profile?.avatarUrl || '').trim();
                const followerCount = profile?.followerCount ?? null;
                const isHydrating = !profile && !!hydratingProfileKeys[key];
                const tooltipTitle = formatFollowerTooltip(displayName, followerCount);
                const handleClick = () => {
                  if (!onChatterClick) return;
                  onChatterClick({
                    id: '',
                    userId: (profile?.userId || chatter.user_id || '').trim(),
                    username: userLogin || displayName,
                    displayName,
                    avatarUrl,
                    message: '',
                  });
                };

                return (
                  <li
                    key={key}
                    ref={(node) => setRowRef(key, node)}
                    data-profile-key={key}
                    className={`flex items-center gap-3 py-2 ${onChatterClick ? 'cursor-pointer' : ''}`}
                    onClick={handleClick}
                  >
                    {avatarUrl !== '' ? (
                      <img
                        src={avatarUrl}
                        alt={`${displayName} avatar`}
                        loading="lazy"
                        title={tooltipTitle}
                        className="h-8 w-8 rounded-full border border-gray-200 object-cover dark:border-gray-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : isHydrating ? (
                      <div className="h-8 w-8 animate-pulse rounded-full border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700" />
                    ) : (
                      <div
                        title={tooltipTitle}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {(displayName || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {displayName}
                        {isHydrating && (
                          <span className="ml-2 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                            読み込み中...
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {userLogin ? `@${userLogin}` : 'login不明'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
