import { useEffect } from 'react';
import type React from 'react';
import { buildApiUrl } from '../../utils/api';
import type {
  CachedUserProfileDetail,
  ChatUserProfileDetail,
  UserInfoPopupState,
} from './types';
import {
  USER_PROFILE_CACHE_INCOMPLETE_TTL_MS,
  USER_PROFILE_CACHE_TTL_MS,
} from './utils';

export const useUserInfoProfileLoader = ({
  userInfoPopup,
  setUserInfoProfile,
  setUserInfoLoading,
  setUserInfoError,
  setUserModerationLoading,
  setUserModerationMessage,
  userProfileDetailCacheRef,
  userInfoFetchSeqRef,
  applyResolvedUserProfile,
}: {
  userInfoPopup: UserInfoPopupState | null;
  setUserInfoProfile: React.Dispatch<React.SetStateAction<ChatUserProfileDetail | null>>;
  setUserInfoLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInfoError: React.Dispatch<React.SetStateAction<string>>;
  setUserModerationLoading: React.Dispatch<React.SetStateAction<'timeout' | 'block' | null>>;
  setUserModerationMessage: React.Dispatch<React.SetStateAction<string>>;
  userProfileDetailCacheRef: React.MutableRefObject<Record<string, CachedUserProfileDetail>>;
  userInfoFetchSeqRef: React.MutableRefObject<number>;
  applyResolvedUserProfile: (profile: ChatUserProfileDetail) => void;
}) => {
  useEffect(() => {
    if (!userInfoPopup) {
      setUserInfoProfile(null);
      setUserInfoLoading(false);
      setUserInfoError('');
      setUserModerationLoading(null);
      setUserModerationMessage('');
      return;
    }

    const userId = (userInfoPopup.message.userId || '').trim();
    const loginHint = (userInfoPopup.message.username || '').trim().toLowerCase();
    if (!userId && !loginHint) {
      setUserInfoProfile(null);
      setUserInfoLoading(false);
      setUserInfoError('このコメントにはユーザー識別情報がなく、プロフィールを取得できません。');
      return;
    }

    const cacheKey = userId || `login:${loginHint}`;
    const cached = userProfileDetailCacheRef.current[cacheKey];
    const ttl = cached?.profile.followerCount == null
      ? USER_PROFILE_CACHE_INCOMPLETE_TTL_MS
      : USER_PROFILE_CACHE_TTL_MS;
    const hasCachedSnapshot = !!cached;
    const hasFreshCache = !!(cached && (Date.now() - cached.fetchedAt) <= ttl);
    if (hasFreshCache && cached) {
      setUserInfoProfile(cached.profile);
      setUserInfoLoading(false);
      setUserInfoError('');
      return;
    }
    setUserInfoProfile(cached?.profile ?? null);
    setUserInfoLoading(true);

    let cancelled = false;
    const seq = ++userInfoFetchSeqRef.current;
    setUserInfoError('');

    const loadUserProfileDetail = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId || undefined,
            username: userInfoPopup.message.username || undefined,
            login: userInfoPopup.message.username || undefined,
            force_refresh: false,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json().catch(() => null);
        const profile: ChatUserProfileDetail = {
          userId: typeof payload?.user_id === 'string' ? payload.user_id : userId,
          username: typeof payload?.username === 'string' ? payload.username : '',
          avatarUrl: typeof payload?.avatar_url === 'string' ? payload.avatar_url : '',
          displayName: typeof payload?.display_name === 'string' ? payload.display_name : '',
          login: typeof payload?.login === 'string' ? payload.login : '',
          description: typeof payload?.description === 'string' ? payload.description : '',
          userType: typeof payload?.user_type === 'string' ? payload.user_type : '',
          broadcasterType: typeof payload?.broadcaster_type === 'string' ? payload.broadcaster_type : '',
          profileImageUrl: typeof payload?.profile_image_url === 'string' ? payload.profile_image_url : '',
          coverImageUrl: typeof payload?.cover_image_url === 'string' ? payload.cover_image_url : '',
          followerCount: typeof payload?.follower_count === 'number' ? payload.follower_count : null,
          viewCount: typeof payload?.view_count === 'number' ? payload.view_count : 0,
          createdAt: typeof payload?.created_at === 'string' ? payload.created_at : '',
          canTimeout: payload?.can_timeout === true || payload?.canTimeout === true,
          canBlock: payload?.can_block === true || payload?.canBlock === true,
        };
        if (cancelled || seq !== userInfoFetchSeqRef.current) {
          return;
        }
        const cacheValue: CachedUserProfileDetail = { profile, fetchedAt: Date.now() };
        userProfileDetailCacheRef.current[cacheKey] = cacheValue;
        if (profile.userId.trim() !== '') {
          userProfileDetailCacheRef.current[profile.userId.trim()] = cacheValue;
        }
        if (profile.login.trim() !== '') {
          userProfileDetailCacheRef.current[`login:${profile.login.trim().toLowerCase()}`] = cacheValue;
        }
        applyResolvedUserProfile(profile);
        setUserInfoProfile(profile);
        setUserInfoLoading(false);
      } catch (error) {
        if (cancelled || seq !== userInfoFetchSeqRef.current) {
          return;
        }
        console.error('[ChatSidebar] Failed to load user profile detail:', error);
        setUserInfoLoading(false);
        setUserInfoError(hasCachedSnapshot ? '最新情報の再取得に失敗しました。' : 'プロフィール取得に失敗しました。');
      }
    };

    void loadUserProfileDetail();

    return () => {
      cancelled = true;
    };
  }, [
    applyResolvedUserProfile,
    setUserInfoError,
    setUserInfoLoading,
    setUserInfoProfile,
    setUserModerationLoading,
    setUserModerationMessage,
    userInfoFetchSeqRef,
    userInfoPopup,
    userProfileDetailCacheRef,
  ]);
};
