import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
} from "../../../utils/chatChannels";
import type { TwitchUserInfo } from "../../../types";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";
import { isPreviewIrcKind } from "./kinds";
import type {
  WorkspaceCardKind,
  WorkspacePreviewHeader,
} from "./types";

const STREAM_TITLE_MAX_LENGTH = 44;

const normalizeStreamTitle = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length > STREAM_TITLE_MAX_LENGTH
    ? `${normalized.slice(0, STREAM_TITLE_MAX_LENGTH - 3)}...`
    : normalized;
};

type PreviewHeaderResolverDeps = {
  activeChatSidebarTabId: string;
  twitchUserInfo: TwitchUserInfo | null;
  streamStatus: { is_live?: boolean; viewer_count?: number; title?: string | null } | null;
  followedChannels: FollowedChannelRailItem[];
  previewWarningByKind: Partial<Record<WorkspaceCardKind, string>>;
};

export const createPreviewHeaderResolver = (
  deps: PreviewHeaderResolverDeps,
): ((kind: WorkspaceCardKind) => WorkspacePreviewHeader | null) => {
  const followedInfoByLogin = new Map<
    string,
    { displayName: string; streamTitle: string | null }
  >();
  for (const channel of deps.followedChannels) {
    const login = normalizeTwitchChannelName(channel.broadcaster_login);
    if (!login) continue;
    followedInfoByLogin.set(login, {
      displayName: channel.broadcaster_name?.trim() || channel.broadcaster_login,
      streamTitle: normalizeStreamTitle(channel.title),
    });
  }

  return (kind: WorkspaceCardKind) => {
    const normalizedActiveTabId = normalizeTwitchChannelName(
      deps.activeChatSidebarTabId,
    );
    if (kind === "preview-main") {
      const channelLogin = deps.twitchUserInfo?.login ?? "";
      const channelDisplayName =
        deps.twitchUserInfo?.display_name?.trim() || channelLogin || "-";
      const isLive = Boolean(deps.streamStatus?.is_live);
      return {
        channelLogin,
        channelDisplayName,
        statusLabel: isLive
          ? `LIVE (${deps.streamStatus?.viewer_count ?? 0})`
          : "OFFLINE",
        streamTitle: normalizeStreamTitle(deps.streamStatus?.title),
        statusClassName: isLive ? "text-red-400" : "text-gray-400",
        warningMessage: deps.previewWarningByKind[kind] ?? null,
        isLinkedChatTab: deps.activeChatSidebarTabId === PRIMARY_CHAT_TAB_ID,
      };
    }
    if (isPreviewIrcKind(kind)) {
      const rawChannelLogin = kind.slice("preview-irc:".length);
      const previewChannel = normalizeTwitchChannelName(rawChannelLogin);
      const followedInfo = previewChannel
        ? followedInfoByLogin.get(previewChannel)
        : undefined;
      return {
        channelLogin: rawChannelLogin,
        channelDisplayName: followedInfo?.displayName || rawChannelLogin || "-",
        statusLabel: "IRC",
        streamTitle: followedInfo?.streamTitle ?? null,
        statusClassName: "text-emerald-400",
        warningMessage: deps.previewWarningByKind[kind] ?? null,
        isLinkedChatTab:
          !!previewChannel && previewChannel === normalizedActiveTabId,
      };
    }
    return null;
  };
};
