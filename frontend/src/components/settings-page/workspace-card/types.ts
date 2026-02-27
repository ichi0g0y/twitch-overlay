import type { Node as FlowNode } from "@xyflow/react";
import type { ReactNode } from "react";

export type BaseWorkspaceCardKind =
  | "preview-main"
  | "general-basic"
  | "general-notification"
  | "general-font"
  | "mic-speech"
  | "mic-overlay-display"
  | "twitch-api"
  | "twitch-reward-groups"
  | "twitch-custom-rewards"
  | "printer-type"
  | "printer-bluetooth"
  | "printer-usb"
  | "printer-print"
  | "printer-clock"
  | "music-manager"
  | "overlay-music-player"
  | "overlay-fax"
  | "overlay-clock"
  | "overlay-mic-transcript"
  | "overlay-reward-count"
  | "overlay-lottery"
  | "logs"
  | "cache-stats"
  | "cache-config"
  | "cache-actions"
  | "api";

export type LegacyWorkspaceCardKind =
  | "general"
  | "mic"
  | "twitch"
  | "printer"
  | "music"
  | "overlay"
  | "cache";

export type WorkspaceCardKind = BaseWorkspaceCardKind | `preview-irc:${string}`;

export type WorkspaceCardMenuItem = {
  kind: WorkspaceCardKind;
  label: string;
  description: string;
};

export type WorkspaceCardNodeData = {
  kind: WorkspaceCardKind;
  title: string;
};

export type WorkspaceCardNode = FlowNode<WorkspaceCardNodeData, "workspace-card">;

export type PreviewViewportExpandSnapshot = {
  position: { x: number; y: number };
  width: number;
  height: number;
  zIndex?: number;
};

export type StoredWorkspaceFlowPayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex?: number;
  }>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type StoredWorkspaceCardLastPositionsPayload = Record<
  string,
  { x: number; y: number }
>;

export type StoredWorkspacePreviewExpandStatePayload = {
  expandedNodeId?: string | null;
  snapshots?: Record<
    string,
    { x: number; y: number; width: number; height: number; zIndex?: number }
  >;
};

export type PortalRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WorkspacePreviewHeader = {
  channelLogin: string;
  channelDisplayName: string;
  statusLabel: string;
  streamTitle: string | null;
  statusClassName: string;
  warningMessage: string | null;
  isLinkedChatTab: boolean;
};

export type RemoveWorkspaceCardOptions = {
  disconnectIrcChannel?: boolean;
};

export type WorkspaceRenderContextValue = {
  removeCard: (id: string, options?: RemoveWorkspaceCardOptions) => void;
  refreshPreview: (kind: WorkspaceCardKind) => void;
  togglePreviewViewportExpand: (id: string) => void;
  isPreviewViewportExpanded: (id: string) => boolean;
  isPreviewInteractionEnabled: (kind: WorkspaceCardKind) => boolean;
  togglePreviewInteraction: (kind: WorkspaceCardKind) => void;
  previewPortalEnabled: boolean;
  resolveCardMinSize: (
    kind: WorkspaceCardKind,
  ) => { minWidth: number; minHeight: number };
  isCollapsibleCardNodeKind: (kind: WorkspaceCardKind) => boolean;
  snapCardSize: (id: string, width: number, height: number) => void;
  renderCard: (kind: WorkspaceCardKind) => ReactNode;
  resolvePreviewHeader: (kind: WorkspaceCardKind) => WorkspacePreviewHeader | null;
};
