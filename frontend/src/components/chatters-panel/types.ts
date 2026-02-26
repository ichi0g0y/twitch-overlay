import type { ChatMessage } from '../ChatSidebarItem';

export type ChattersPanelProps = {
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

export type ChattersResponse = {
  data?: unknown;
  count?: number;
  total?: number;
};

export type HydratedChatterProfile = {
  userId: string;
  userLogin: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number | null;
};

export const SCOPE_MISSING_MESSAGE =
  '視聴者一覧の取得には moderator:read:chatters 権限が必要です。再認証後にお試しください。';
export const PROFILE_HYDRATION_MAX = 200;
export const PROFILE_HYDRATION_CONCURRENCY = 6;
export const PROFILE_HYDRATION_RETRY_MAX = 2;

export const formatFollowerTooltip = (
  displayName: string,
  followerCount: number | null,
) => {
  const followerLabel =
    typeof followerCount === 'number'
      ? followerCount.toLocaleString('ja-JP')
      : '不明';
  return `${displayName} - フォロワー: ${followerLabel}`;
};

export const chatterProfileKey = (chatter: ChattersPanelChatter) => {
  const userId = chatter.user_id.trim();
  if (userId !== '') return `id:${userId}`;
  const login = chatter.user_login.trim().toLowerCase();
  if (login !== '') return `login:${login}`;
  return `name:${chatter.user_name.trim().toLowerCase()}`;
};
