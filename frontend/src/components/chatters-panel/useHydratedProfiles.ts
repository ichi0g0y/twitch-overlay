import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl } from '../../utils/api';
import type {
  ChattersPanelChatter,
  HydratedChatterProfile,
} from './types';
import {
  PROFILE_HYDRATION_CONCURRENCY,
  PROFILE_HYDRATION_MAX,
  PROFILE_HYDRATION_RETRY_MAX,
} from './types';

export const useHydratedProfiles = ({
  open,
  channelLogin,
  chatterRows,
}: {
  open: boolean;
  channelLogin?: string;
  chatterRows: Array<{ key: string; chatter: ChattersPanelChatter }>;
}) => {
  const [hydratedProfiles, setHydratedProfiles] = useState<
    Record<string, HydratedChatterProfile>
  >({});
  const profileHydrationInFlightRef = useRef<Set<string>>(new Set());
  const profileHydrationAttemptRef = useRef<Record<string, number>>({});
  const [hydratingProfileKeys, setHydratingProfileKeys] = useState<
    Record<string, true>
  >({});
  const [visibleProfileKeys, setVisibleProfileKeys] = useState<
    Record<string, true>
  >({});
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const setRowRef = useCallback((key: string, node: HTMLLIElement | null) => {
    if (node) {
      rowRefs.current[key] = node;
      return;
    }
    delete rowRefs.current[key];
  }, []);

  useEffect(() => {
    if (!open) return;
    profileHydrationAttemptRef.current = {};
  }, [channelLogin, open]);

  useEffect(() => {
    if (!open || chatterRows.length === 0) {
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

    const observer = new IntersectionObserver(
      (entries) => {
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
      },
      {
        root: listElement,
        rootMargin: '96px 0px 192px 0px',
        threshold: 0.01,
      },
    );

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
    const availableSlots = Math.max(
      0,
      PROFILE_HYDRATION_CONCURRENCY - inFlightCount,
    );
    if (availableSlots <= 0) return;

    const queue = chatterRows
      .filter(({ key }) => !(key in hydratedProfiles))
      .filter(({ key }) => !profileHydrationInFlightRef.current.has(key))
      .filter(
        ({ key }) =>
          (profileHydrationAttemptRef.current[key] || 0)
          < PROFILE_HYDRATION_RETRY_MAX,
      )
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
          const response = await fetch(
            buildApiUrl('/api/chat/user-profile/detail'),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: chatter.user_id || undefined,
                username: chatter.user_login || chatter.user_name || undefined,
                login: chatter.user_login || undefined,
              }),
            },
          );
          if (!response.ok) return;

          const payload = await response.json().catch(() => null);
          const userId =
            typeof payload?.user_id === 'string'
              ? payload.user_id.trim()
              : chatter.user_id.trim();
          const userLogin =
            typeof payload?.login === 'string'
              ? payload.login.trim().toLowerCase()
              : chatter.user_login.trim().toLowerCase();
          const displayName =
            typeof payload?.display_name === 'string' &&
            payload.display_name.trim() !== ''
              ? payload.display_name.trim()
              : typeof payload?.username === 'string' &&
                  payload.username.trim() !== ''
                ? payload.username.trim()
                : chatter.user_name.trim();
          const profileImageUrl =
            typeof payload?.profile_image_url === 'string'
              ? payload.profile_image_url.trim()
              : '';
          const avatarUrl = profileImageUrl ||
            (typeof payload?.avatar_url === 'string'
              ? payload.avatar_url.trim()
              : '');
          const followerCount =
            typeof payload?.follower_count === 'number'
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
            if (profile.userId !== '') nextProfiles[`id:${profile.userId}`] = profile;
            if (profile.userLogin !== '') nextProfiles[`login:${profile.userLogin}`] = profile;
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

  const hydratingCount = useMemo(
    () => Object.keys(hydratingProfileKeys).length,
    [hydratingProfileKeys],
  );

  return {
    hydratedProfiles,
    hydratingProfileKeys,
    hydratingCount,
    listContainerRef,
    setRowRef,
  };
};
