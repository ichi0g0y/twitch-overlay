import type React from 'react';

export type FollowedChannelRailItem = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  profile_image_url: string;
  followed_at?: string;
  is_live: boolean;
  viewer_count: number;
  follower_count?: number | null;
  title?: string | null;
  game_name?: string | null;
  started_at?: string | null;
  last_broadcast_at?: string | null;
};

export type FollowedChannelsRailProps = {
  side: 'left' | 'right';
  channels: FollowedChannelRailItem[];
  loading: boolean;
  error: string;
  canStartRaid: boolean;
  chatWidth: number;
  chatPanel: React.ReactNode;
  twitchUserId?: string;
  twitchAvatarUrl?: string;
  twitchDisplayName?: string;
  onSideChange: (side: 'left' | 'right') => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
  onAddIrcPreview: (channelLogin: string) => void;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
  onStartShoutout: (channel: FollowedChannelRailItem) => Promise<void>;
};
