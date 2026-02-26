import {
  useCallback,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
} from "../../../utils/chatChannels";
import { isPreviewCardKind } from "./kinds";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

type ChatSidebarActiveTabRequest = { tabId: string; requestId: number } | null;

type UseWorkspaceNodeClickParams = {
  activatePreviewInteraction: (kind: WorkspaceCardKind) => void;
  bringPreviewNodeToFront: (nodeId: string) => void;
  setChatSidebarActiveTabRequest: Dispatch<
    SetStateAction<ChatSidebarActiveTabRequest>
  >;
};

export const useWorkspaceNodeClick = ({
  activatePreviewInteraction,
  bringPreviewNodeToFront,
  setChatSidebarActiveTabRequest,
}: UseWorkspaceNodeClickParams) =>
  useCallback(
    (_event: ReactMouseEvent, node: WorkspaceCardNode) => {
      if (!isPreviewCardKind(node.data.kind)) return;
      activatePreviewInteraction(node.data.kind);
      bringPreviewNodeToFront(node.id);
      const requestedTabId =
        node.data.kind === "preview-main"
          ? PRIMARY_CHAT_TAB_ID
          : normalizeTwitchChannelName(
              node.data.kind.slice("preview-irc:".length),
            );
      if (!requestedTabId) return;
      setChatSidebarActiveTabRequest((current) => ({
        tabId: requestedTabId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    },
    [
      activatePreviewInteraction,
      bringPreviewNodeToFront,
      setChatSidebarActiveTabRequest,
    ],
  );
