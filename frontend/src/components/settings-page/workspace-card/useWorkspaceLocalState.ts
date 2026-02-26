import { type Dispatch, type SetStateAction, useState } from "react";
import type { Viewport } from "@xyflow/react";
import { PRIMARY_CHAT_TAB_ID } from "../../../utils/chatChannels";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";
import {
  FOLLOWED_RAIL_SIDE_STORAGE_KEY,
  SIDEBAR_DEFAULT_FONT_SIZE,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_FONT_SIZE_STORAGE_KEY,
  SIDEBAR_MAX_FONT_SIZE,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_FONT_SIZE,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  WORKSPACE_SNAP_ENABLED_STORAGE_KEY,
} from "./constants";
import type { WorkspaceCardKind } from "./types";

type WorkspaceFlowState = {
  nodes: unknown[];
  viewport: Viewport | null;
} | null;

type PreviewExpandState = {
  expandedNodeId: string | null;
};

type ChatSidebarActiveTabRequest = { tabId: string; requestId: number } | null;

export type WorkspaceLocalState = {
  followedRailSide: "left" | "right";
  setFollowedRailSide: Dispatch<SetStateAction<"left" | "right">>;
  followedChannels: FollowedChannelRailItem[];
  setFollowedChannels: Dispatch<SetStateAction<FollowedChannelRailItem[]>>;
  followedChannelsLoading: boolean;
  setFollowedChannelsLoading: Dispatch<SetStateAction<boolean>>;
  followedChannelsError: string;
  setFollowedChannelsError: Dispatch<SetStateAction<string>>;
  chatSidebarWidth: number;
  setChatSidebarWidth: Dispatch<SetStateAction<number>>;
  chatSidebarFontSize: number;
  setChatSidebarFontSize: Dispatch<SetStateAction<number>>;
  workspaceSnapEnabled: boolean;
  setWorkspaceSnapEnabled: Dispatch<SetStateAction<boolean>>;
  workspaceViewport: Viewport | null;
  setWorkspaceViewport: Dispatch<SetStateAction<Viewport | null>>;
  previewReloadNonceByKind: Record<string, number>;
  setPreviewReloadNonceByKind: Dispatch<SetStateAction<Record<string, number>>>;
  previewWarningByKind: Partial<Record<WorkspaceCardKind, string>>;
  setPreviewWarningByKind: Dispatch<
    SetStateAction<Partial<Record<WorkspaceCardKind, string>>>
  >;
  expandedPreviewNodeId: string | null;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
  chatSidebarActiveTabRequest: ChatSidebarActiveTabRequest;
  setChatSidebarActiveTabRequest: Dispatch<
    SetStateAction<ChatSidebarActiveTabRequest>
  >;
  activeChatSidebarTabId: string;
  setActiveChatSidebarTabId: Dispatch<SetStateAction<string>>;
  pendingPreviewRevealKind: WorkspaceCardKind | null;
  setPendingPreviewRevealKind: Dispatch<
    SetStateAction<WorkspaceCardKind | null>
  >;
  panningSettingsOpen: boolean;
  setPanningSettingsOpen: Dispatch<SetStateAction<boolean>>;
  isWorkspaceFlowReady: boolean;
  setIsWorkspaceFlowReady: Dispatch<SetStateAction<boolean>>;
  isWorkspaceControlsVisible: boolean;
  setIsWorkspaceControlsVisible: Dispatch<SetStateAction<boolean>>;
  isQuickControlsHovered: boolean;
  setIsQuickControlsHovered: Dispatch<SetStateAction<boolean>>;
  isPanKeyActive: boolean;
  setIsPanKeyActive: Dispatch<SetStateAction<boolean>>;
  isZoomActivationKeyActive: boolean;
  setIsZoomActivationKeyActive: Dispatch<SetStateAction<boolean>>;
  previewInteractionKind: WorkspaceCardKind | null;
  setPreviewInteractionKind: Dispatch<
    SetStateAction<WorkspaceCardKind | null>
  >;
};

type UseWorkspaceLocalStateParams = {
  initialWorkspaceFlow: WorkspaceFlowState;
  initialPreviewExpandState: PreviewExpandState;
};

export const useWorkspaceLocalState = ({
  initialWorkspaceFlow,
  initialPreviewExpandState,
}: UseWorkspaceLocalStateParams): WorkspaceLocalState => {
  const [followedRailSide, setFollowedRailSide] = useState<"left" | "right">(
    () => {
      if (typeof window === "undefined") return "right";
      const stored = window.localStorage.getItem(FOLLOWED_RAIL_SIDE_STORAGE_KEY);
      return stored === "left" ? "left" : "right";
    },
  );
  const [followedChannels, setFollowedChannels] = useState<
    FollowedChannelRailItem[]
  >([]);
  const [followedChannelsLoading, setFollowedChannelsLoading] = useState(false);
  const [followedChannelsError, setFollowedChannelsError] = useState("");
  const [chatSidebarWidth, setChatSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
  });
  const [chatSidebarFontSize, setChatSidebarFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_FONT_SIZE;
    const stored = window.localStorage.getItem(SIDEBAR_FONT_SIZE_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_FONT_SIZE;
    return Math.min(
      SIDEBAR_MAX_FONT_SIZE,
      Math.max(SIDEBAR_MIN_FONT_SIZE, parsed),
    );
  });
  const [workspaceSnapEnabled, setWorkspaceSnapEnabled] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return true;
      const stored = window.localStorage.getItem(
        WORKSPACE_SNAP_ENABLED_STORAGE_KEY,
      );
      return stored == null ? true : stored !== "false";
    },
  );
  const [workspaceViewport, setWorkspaceViewport] = useState<Viewport | null>(
    () => initialWorkspaceFlow?.viewport ?? null,
  );
  const [previewReloadNonceByKind, setPreviewReloadNonceByKind] = useState<
    Record<string, number>
  >({});
  const [previewWarningByKind, setPreviewWarningByKind] = useState<
    Partial<Record<WorkspaceCardKind, string>>
  >({});
  const [expandedPreviewNodeId, setExpandedPreviewNodeId] = useState<
    string | null
  >(() => initialPreviewExpandState.expandedNodeId);
  const [chatSidebarActiveTabRequest, setChatSidebarActiveTabRequest] =
    useState<ChatSidebarActiveTabRequest>(null);
  const [activeChatSidebarTabId, setActiveChatSidebarTabId] =
    useState<string>(PRIMARY_CHAT_TAB_ID);
  const [pendingPreviewRevealKind, setPendingPreviewRevealKind] =
    useState<WorkspaceCardKind | null>(null);
  const [panningSettingsOpen, setPanningSettingsOpen] = useState(false);
  const [isWorkspaceFlowReady, setIsWorkspaceFlowReady] = useState(false);
  const [isWorkspaceControlsVisible, setIsWorkspaceControlsVisible] =
    useState(false);
  const [isQuickControlsHovered, setIsQuickControlsHovered] = useState(false);
  const [isPanKeyActive, setIsPanKeyActive] = useState(false);
  const [isZoomActivationKeyActive, setIsZoomActivationKeyActive] =
    useState(false);
  const [previewInteractionKind, setPreviewInteractionKind] =
    useState<WorkspaceCardKind | null>(null);

  return {
    followedRailSide,
    setFollowedRailSide,
    followedChannels,
    setFollowedChannels,
    followedChannelsLoading,
    setFollowedChannelsLoading,
    followedChannelsError,
    setFollowedChannelsError,
    chatSidebarWidth,
    setChatSidebarWidth,
    chatSidebarFontSize,
    setChatSidebarFontSize,
    workspaceSnapEnabled,
    setWorkspaceSnapEnabled,
    workspaceViewport,
    setWorkspaceViewport,
    previewReloadNonceByKind,
    setPreviewReloadNonceByKind,
    previewWarningByKind,
    setPreviewWarningByKind,
    expandedPreviewNodeId,
    setExpandedPreviewNodeId,
    chatSidebarActiveTabRequest,
    setChatSidebarActiveTabRequest,
    activeChatSidebarTabId,
    setActiveChatSidebarTabId,
    pendingPreviewRevealKind,
    setPendingPreviewRevealKind,
    panningSettingsOpen,
    setPanningSettingsOpen,
    isWorkspaceFlowReady,
    setIsWorkspaceFlowReady,
    isWorkspaceControlsVisible,
    setIsWorkspaceControlsVisible,
    isQuickControlsHovered,
    setIsQuickControlsHovered,
    isPanKeyActive,
    setIsPanKeyActive,
    isZoomActivationKeyActive,
    setIsZoomActivationKeyActive,
    previewInteractionKind,
    setPreviewInteractionKind,
  };
};
