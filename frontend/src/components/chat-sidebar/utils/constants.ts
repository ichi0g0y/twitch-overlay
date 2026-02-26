export const HISTORY_DAYS = 7;
export const COLLAPSE_STORAGE_KEY = 'chat_sidebar_collapsed';
export const ACTIVE_TAB_STORAGE_KEY = 'chat_sidebar_active_tab';
export const MESSAGE_ORDER_REVERSED_STORAGE_KEY =
  'chat_sidebar_message_order_reversed_by_tab';
export const LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY =
  'chat_sidebar_message_order_reversed';
export const CHAT_DISPLAY_MODE_STORAGE_KEY = 'chat_sidebar_display_mode_by_tab';
export const LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY = 'chat_sidebar_display_mode';
export const RESIZE_MIN_WIDTH = 220;
export const RESIZE_MAX_WIDTH = 520;
export const FONT_MIN_SIZE = 12;
export const FONT_MAX_SIZE = 40;
export const EMBED_MIN_WIDTH = 340;
export const EMOTE_CDN_BASE = 'https://static-cdn.jtvnw.net/emoticons/v2';
export const IRC_ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443';
export const IRC_RECONNECT_BASE_DELAY_MS = 2000;
export const IRC_RECONNECT_MAX_DELAY_MS = 20000;
export const IRC_HISTORY_LIMIT = 300;
export const IRC_ANONYMOUS_PASS = 'SCHMOOPIIE';
export const PRIMARY_IRC_CONNECTION_PREFIX = '__primary_irc__';
export const COLLAPSED_DESKTOP_WIDTH = 48;
export const EDGE_RAIL_OFFSET_XL_PX = 64;
export const USER_PROFILE_CACHE_TTL_MS = 30_000;
export const USER_PROFILE_CACHE_INCOMPLETE_TTL_MS = 5_000;
export const DEFAULT_TIMEOUT_SECONDS = 10 * 60;
export const DISPLAY_NAME_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DISPLAY_NAME_REFRESH_TICK_MS = 10 * 60 * 1000;
export const PRIMARY_IRC_CREDENTIAL_REFRESH_MS = 15 * 1000;
export const IVR_TWITCH_USER_ENDPOINT = 'https://api.ivr.fi/v2/twitch/user';
export const IVR_BADGES_GLOBAL_ENDPOINT =
  'https://api.ivr.fi/v2/twitch/badges/global';
export const IVR_BADGES_CHANNEL_ENDPOINT =
  'https://api.ivr.fi/v2/twitch/badges/channel';

export const primaryIrcConnectionKey = (login: string) =>
  `${PRIMARY_IRC_CONNECTION_PREFIX}${login}`;
