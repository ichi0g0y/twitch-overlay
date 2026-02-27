import type { ChatFragment, ChatMessage } from '../ChatSidebarItem';

export type IrcConnection = {
  channel: string;
  isPrimary: boolean;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  stopped: boolean;
  nick: string;
  pass: string;
  authenticated: boolean;
  generation: number;
  userId: string;
  login: string;
  displayName: string;
};

export type IrcUserProfile = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type IrcCredentialsResponse = {
  authenticated?: boolean;
  nick?: string;
  pass?: string;
  login?: string;
  user_id?: string;
  display_name?: string;
};

export type IrcChannelDisplayProfile = {
  channel_login?: string;
  display_name?: string;
  updated_at?: number;
};

export type IrcParticipant = {
  userId?: string;
  userLogin: string;
  userName: string;
  lastSeenAt: number;
};

export type ResolvedIrcCredentials = {
  authenticated: boolean;
  nick: string;
  pass: string;
  login: string;
  userId: string;
  displayName: string;
};

export type MessageOrderReversedByTab = Record<string, boolean>;
export type ChatDisplayMode = 'custom' | 'embed';
export type ChatDisplayModeByTab = Record<string, ChatDisplayMode>;

export type DateSeparatorInfo = {
  key: string;
  label: string;
};

export type ChatDisplayItem =
  | {
      type: 'date-separator';
      key: string;
      label: string;
    }
  | {
      type: 'message';
      key: string;
      message: ChatMessage;
      index: number;
    };

export type UserInfoPopupState = {
  message: ChatMessage;
  tabId: string;
};

export type EmoteInfoPopupState = {
  id: string;
  tabId: string;
  message: ChatMessage;
  fragment: ChatFragment;
  source: 'channel' | 'global';
  channelLogin?: string;
};

export type ChatUserProfileDetail = {
  userId: string;
  username: string;
  avatarUrl: string;
  displayName: string;
  login: string;
  description: string;
  userType: string;
  broadcasterType: string;
  profileImageUrl: string;
  coverImageUrl: string;
  followerCount: number | null;
  viewCount: number;
  createdAt: string;
  canTimeout: boolean;
  canBlock: boolean;
};

export type CachedUserProfileDetail = {
  profile: ChatUserProfileDetail;
  fetchedAt: number;
};

export type BadgeVisual = {
  imageUrl: string;
  label: string;
};

export type IvrBadgeVersion = {
  id?: string;
  title?: string;
  description?: string;
  image_url_1x?: string;
  image_url_2x?: string;
  image_url_4x?: string;
};

export type IvrBadgeSet = {
  set_id?: string;
  versions?: IvrBadgeVersion[];
};
