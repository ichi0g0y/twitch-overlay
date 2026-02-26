import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import type { ChatUserProfileDetail, UserInfoPopupState } from './types';

export const buildUserInfoViewModel = ({
  userInfoProfile,
  userInfoPopup,
}: {
  userInfoProfile: ChatUserProfileDetail | null;
  userInfoPopup: UserInfoPopupState | null;
}) => {
  const popupProfileName = (
    userInfoProfile?.displayName
    || userInfoProfile?.username
    || userInfoPopup?.message.displayName
    || userInfoPopup?.message.username
    || ''
  ).trim();
  const popupProfileLogin = (userInfoProfile?.login || '').trim();
  const popupProfileAvatar = (
    userInfoProfile?.profileImageUrl
    || userInfoProfile?.avatarUrl
    || userInfoPopup?.message.avatarUrl
    || ''
  ).trim();
  const popupProfileCover = (userInfoProfile?.coverImageUrl || '').trim();
  const popupProfileDescription = (userInfoProfile?.description || '').trim();

  const popupChannelLogin = (() => {
    const login = popupProfileLogin.trim().toLowerCase();
    if (login !== '') return login;
    const fallback = (userInfoPopup?.message.username || '').trim().toLowerCase();
    return /^[a-z0-9_]{3,25}$/.test(fallback) ? fallback : '';
  })();

  const popupChannelUrl = popupChannelLogin ? `https://www.twitch.tv/${popupChannelLogin}` : '';
  const userInfoCreatedAtLabel = (() => {
    const raw = (userInfoProfile?.createdAt || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
  })();

  const userInfoFollowerCountLabel = typeof userInfoProfile?.followerCount === 'number'
    ? userInfoProfile.followerCount.toLocaleString()
    : '';
  const userInfoTypeLabel = [userInfoProfile?.broadcasterType, userInfoProfile?.userType]
    .filter((value) => value && value.trim() !== '')
    .join(' / ');
  const userInfoResolvedUserId = ((userInfoProfile?.userId || userInfoPopup?.message.userId || '')).trim();

  const moderationTargetName = (
    userInfoProfile?.displayName
    || userInfoProfile?.username
    || userInfoPopup?.message.displayName
    || userInfoPopup?.message.username
    || userInfoResolvedUserId
    || 'このユーザー'
  ).trim();

  const moderationAllowedOnPopup = userInfoPopup?.tabId === PRIMARY_CHAT_TAB_ID;
  const userInfoCanTimeout = moderationAllowedOnPopup && userInfoProfile?.canTimeout === true && userInfoResolvedUserId !== '';
  const userInfoCanBlock = moderationAllowedOnPopup && userInfoProfile?.canBlock === true && userInfoResolvedUserId !== '';

  const moderationUnavailableReason = (() => {
    if (!userInfoPopup) return '';
    if (!moderationAllowedOnPopup) {
      return 'モデレーション操作はメインタブでのみ利用できます。';
    }
    if (userInfoResolvedUserId === '') {
      return 'ユーザーIDを解決できないため、モデレーション操作は利用できません。';
    }
    if (!userInfoCanTimeout && !userInfoCanBlock) {
      return '必要なTwitchスコープ不足のため操作できません。再認証で moderator:manage:banned_users / user:manage:blocked_users を付与してください。';
    }
    return '';
  })();

  return {
    popupProfileName,
    popupProfileLogin,
    popupProfileAvatar,
    popupProfileCover,
    popupProfileDescription,
    popupChannelLogin,
    popupChannelUrl,
    userInfoCreatedAtLabel,
    userInfoFollowerCountLabel,
    userInfoTypeLabel,
    userInfoResolvedUserId,
    moderationTargetName,
    userInfoCanTimeout,
    userInfoCanBlock,
    moderationUnavailableReason,
  };
};
