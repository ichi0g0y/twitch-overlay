import { buildApiUrl } from "../../../utils/api";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";

type RawFollowedChannel = Record<string, unknown>;

export const normalizeFollowedChannel = (
  item: RawFollowedChannel,
): FollowedChannelRailItem | null => {
  const viewerCount = Number(item.viewer_count ?? item.viewerCount ?? 0) || 0;
  const followerCount =
    typeof item.follower_count === "number"
      ? item.follower_count
      : typeof item.followerCount === "number"
        ? item.followerCount
        : undefined;
  const startedAt =
    typeof item.started_at === "string"
      ? item.started_at
      : typeof item.startedAt === "string"
        ? item.startedAt
        : undefined;
  const liveFlag = item.is_live ?? item.isLive;
  const isLive =
    typeof liveFlag === "boolean"
      ? liveFlag
      : viewerCount > 0 || Boolean(startedAt);
  const lastBroadcastAt =
    typeof item.last_broadcast_at === "string"
      ? item.last_broadcast_at
      : undefined;

  const normalized: FollowedChannelRailItem = {
    broadcaster_id: String(item.broadcaster_id ?? item.id ?? ""),
    broadcaster_login: String(item.broadcaster_login ?? item.login ?? ""),
    broadcaster_name: String(
      item.broadcaster_name ?? item.display_name ?? item.login ?? "",
    ),
    profile_image_url: String(item.profile_image_url ?? ""),
    followed_at:
      typeof item.followed_at === "string" ? item.followed_at : undefined,
    is_live: isLive,
    viewer_count: viewerCount,
    follower_count: followerCount,
    title: typeof item.title === "string" ? item.title : undefined,
    game_name: typeof item.game_name === "string" ? item.game_name : undefined,
    started_at: startedAt,
    last_broadcast_at: lastBroadcastAt,
  };

  if (!normalized.broadcaster_id || !normalized.broadcaster_login) {
    return null;
  }
  return normalized;
};

export const sortFollowedChannels = (
  channels: FollowedChannelRailItem[],
): FollowedChannelRailItem[] => {
  return [...channels].sort((a, b) => {
    if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
    if (a.viewer_count !== b.viewer_count) return b.viewer_count - a.viewer_count;
    const aDate = a.last_broadcast_at ?? "";
    const bDate = b.last_broadcast_at ?? "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return a.broadcaster_name.localeCompare(b.broadcaster_name, "ja");
  });
};

export const fetchFollowedChannels = async (limit: number) => {
  const response = await fetch(
    buildApiUrl(`/api/twitch/followed-channels?limit=${limit}&_ts=${Date.now()}`),
    {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const data = Array.isArray(payload?.data)
    ? (payload.data as RawFollowedChannel[])
    : [];
  const normalized = data
    .map(normalizeFollowedChannel)
    .filter((item): item is FollowedChannelRailItem => Boolean(item));
  return sortFollowedChannels(normalized);
};

export const startRaidToChannel = async (
  channel: FollowedChannelRailItem,
  isStreamingLive: boolean,
) => {
  if (!isStreamingLive) {
    throw new Error("配信中のみレイドできます");
  }
  const targetChannelLogin = (channel.broadcaster_login || "")
    .trim()
    .toLowerCase();
  if (!targetChannelLogin) {
    throw new Error("レイド先チャンネルが不正です");
  }

  const response = await fetch(buildApiUrl("/api/twitch/raid/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_channel_login: targetChannelLogin,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
};

export const startShoutoutToChannel = async (
  channel: FollowedChannelRailItem,
  isStreamingLive: boolean,
) => {
  if (!isStreamingLive) {
    throw new Error("配信中のみ応援できます");
  }
  if (!channel.is_live) {
    throw new Error("LIVE中のチャンネルのみ応援できます");
  }
  const targetChannelLogin = (channel.broadcaster_login || "")
    .trim()
    .toLowerCase();
  if (!targetChannelLogin) {
    throw new Error("応援先チャンネルが不正です");
  }

  const response = await fetch(buildApiUrl("/api/twitch/shoutout/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_channel_login: targetChannelLogin,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
};
