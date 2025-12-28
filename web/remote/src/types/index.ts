export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  has_artwork: boolean;
}

export interface MusicStatus {
  playback_status: string;
  is_playing: boolean;
  current_track: MusicTrack | null;
  current_time: number;
  duration: number;
  volume: number;
  playlist_name?: string;
}

export interface OverlaySettings {
  music_enabled?: boolean;
  music_volume?: number;
  music_playlist?: string | null;
  fax_enabled?: boolean;
  fax_animation_speed?: number;
  fax_image_type?: string;
  clock_enabled?: boolean;
  clock_show_icons?: boolean;
  location_enabled?: boolean;
  date_enabled?: boolean;
  time_enabled?: boolean;
  reward_count_enabled?: boolean;
  reward_count_group_id?: number | null;
  reward_count_position?: string;
  lottery_enabled?: boolean;
  lottery_reward_id?: string | null;
  lottery_ticker_enabled?: boolean;
  ticker_notice_enabled?: boolean;
  ticker_notice_text?: string;
  ticker_notice_font_size?: number;
  ticker_notice_align?: string;
  overlay_cards_expanded?: string;
  best_quality?: boolean;
  dither?: boolean;
  black_point?: number;
  auto_rotate?: boolean;
  rotate_print?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  track_count: number;
}

export interface RewardGroup {
  id: number;
  name: string;
}

export interface CustomReward {
  id: string;
  title: string;
  cost: number;
}

export interface RewardCount {
  reward_id: string;
  count: number;
  title?: string;
  display_name?: string;
  user_names?: string[];
}

export interface AuthStatus {
  authenticated: boolean;
}
