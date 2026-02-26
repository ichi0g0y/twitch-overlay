import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
} from "../../../utils/chatChannels";
import { isPreviewIrcKind } from "./kinds";
import type {
  WorkspaceCardKind,
  WorkspacePreviewHeader,
} from "./types";

type PreviewHeaderResolverDeps = {
  activeChatSidebarTabId: string;
  twitchUserInfo: { login?: string } | null;
  streamStatus: { is_live?: boolean; viewer_count?: number } | null;
  previewWarningByKind: Partial<Record<WorkspaceCardKind, string>>;
};

export const createPreviewHeaderResolver = (
  deps: PreviewHeaderResolverDeps,
): ((kind: WorkspaceCardKind) => WorkspacePreviewHeader | null) => {
  return (kind: WorkspaceCardKind) => {
    const normalizedActiveTabId = normalizeTwitchChannelName(
      deps.activeChatSidebarTabId,
    );
    if (kind === "preview-main") {
      const channelLogin = deps.twitchUserInfo?.login ?? "";
      const isLive = Boolean(deps.streamStatus?.is_live);
      return {
        channelLogin,
        statusLabel: isLive
          ? `LIVE (${deps.streamStatus?.viewer_count ?? 0})`
          : "OFFLINE",
        statusClassName: isLive ? "text-red-400" : "text-gray-400",
        warningMessage: deps.previewWarningByKind[kind] ?? null,
        isLinkedChatTab: deps.activeChatSidebarTabId === PRIMARY_CHAT_TAB_ID,
      };
    }
    if (isPreviewIrcKind(kind)) {
      const previewChannel = normalizeTwitchChannelName(
        kind.slice("preview-irc:".length),
      );
      return {
        channelLogin: kind.slice("preview-irc:".length),
        statusLabel: "IRC",
        statusClassName: "text-emerald-400",
        warningMessage: deps.previewWarningByKind[kind] ?? null,
        isLinkedChatTab:
          !!previewChannel && previewChannel === normalizedActiveTabId,
      };
    }
    return null;
  };
};
