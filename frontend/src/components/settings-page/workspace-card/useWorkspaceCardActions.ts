import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  appendIrcChannel,
  readIrcChannels,
  writeIrcChannels,
} from "../../../utils/chatChannels";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";
import { startRaidToChannel, startShoutoutToChannel } from "./followedChannels";
import { isPreviewCardKind } from "./kinds";
import {
  createWorkspaceNode,
  findAvailableWorkspaceCardPosition,
  reorderPreviewNodesForFront,
  resolveWorkspaceCardSize,
} from "./node";
import { writeWorkspaceCardLastPositions } from "./storage";
import type {
  PreviewViewportExpandSnapshot,
  WorkspaceCardKind,
  WorkspaceCardNode,
} from "./types";

type UseWorkspaceCardActionsParams = {
  nodes: WorkspaceCardNode[];
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
  streamIsLive: boolean;
  workspaceFlowInstanceRef: RefObject<ReactFlowInstance<WorkspaceCardNode> | null>;
  lastWorkspaceCardPositionRef: MutableRefObject<
    Partial<Record<WorkspaceCardKind, { x: number; y: number }>>
  >;
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  previewExpandSnapshotRef: MutableRefObject<
    Record<string, PreviewViewportExpandSnapshot>
  >;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
  setChatSidebarActiveTabRequest: Dispatch<
    SetStateAction<{ tabId: string; requestId: number } | null>
  >;
  setPendingPreviewRevealKind: Dispatch<SetStateAction<WorkspaceCardKind | null>>;
};

export const useWorkspaceCardActions = ({
  nodes,
  setNodes,
  streamIsLive,
  workspaceFlowInstanceRef,
  lastWorkspaceCardPositionRef,
  expandedPreviewNodeIdRef,
  previewExpandSnapshotRef,
  setExpandedPreviewNodeId,
  setChatSidebarActiveTabRequest,
  setPendingPreviewRevealKind,
}: UseWorkspaceCardActionsParams) => {
  const resolveWorkspaceCardSpawnPosition = useCallback(
    (kind: WorkspaceCardKind, existingNodes: WorkspaceCardNode[]) => {
      const existingCount = existingNodes.length;
      const remembered = lastWorkspaceCardPositionRef.current[kind];
      if (remembered) {
        return findAvailableWorkspaceCardPosition(
          kind,
          remembered,
          existingNodes,
        );
      }

      const offset = existingCount * 36;
      const fallback = {
        x: 160 + (offset % 720),
        y: 120 + Math.floor(offset / 6) * 52,
      };

      const instance = workspaceFlowInstanceRef.current;
      if (!instance || typeof window === "undefined") {
        return findAvailableWorkspaceCardPosition(
          kind,
          fallback,
          existingNodes,
        );
      }

      try {
        const base = instance.screenToFlowPosition({
          x: Math.max(0, Math.floor(window.innerWidth / 2)),
          y: Math.max(0, Math.floor(window.innerHeight / 2)),
        });
        const size = resolveWorkspaceCardSize(kind);
        const shift = (existingCount % 6) * 24;
        return findAvailableWorkspaceCardPosition(
          kind,
          {
            x: base.x - size.width / 2 + shift,
            y: base.y - size.height / 2 + Math.floor(existingCount / 6) * 24,
          },
          existingNodes,
        );
      } catch {
        return findAvailableWorkspaceCardPosition(
          kind,
          fallback,
          existingNodes,
        );
      }
    },
    [lastWorkspaceCardPositionRef, workspaceFlowInstanceRef],
  );

  const connectIrcChannel = useCallback((channelLogin: string) => {
    const normalized = (channelLogin || "").trim().toLowerCase();
    if (!normalized) return;
    const current = readIrcChannels();
    const next = appendIrcChannel(current, normalized);
    if (next.length === current.length && next.every((channel, index) => channel === current[index])) return;
    writeIrcChannels(next);
  }, []);

  const addIrcPreviewCard = useCallback(
    (channelLogin: string, options?: { reveal?: boolean }) => {
      const normalized = (channelLogin || "").trim().toLowerCase();
      if (!normalized) return;
      const shouldReveal = options?.reveal ?? true;
      connectIrcChannel(normalized);
      const previewKind = `preview-irc:${normalized}` as WorkspaceCardKind;
      setNodes((existing) => {
        if (existing.some((node) => node.data.kind === previewKind))
          return existing;
        const position = resolveWorkspaceCardSpawnPosition(previewKind, existing);
        const created = createWorkspaceNode(previewKind, position);
        return reorderPreviewNodesForFront(
          [...existing, created],
          created.id,
          expandedPreviewNodeIdRef.current,
        );
      });
      if (shouldReveal) {
        setChatSidebarActiveTabRequest((current) => ({
          tabId: normalized,
          requestId: (current?.requestId ?? 0) + 1,
        }));
        setPendingPreviewRevealKind(previewKind);
      }
    },
    [
      connectIrcChannel,
      expandedPreviewNodeIdRef,
      resolveWorkspaceCardSpawnPosition,
      setChatSidebarActiveTabRequest,
      setNodes,
      setPendingPreviewRevealKind,
    ],
  );

  const addWorkspaceCard = useCallback(
    (kind: WorkspaceCardKind) => {
      setNodes((current) => {
        if (current.some((node) => node.data.kind === kind)) {
          return current;
        }
        const position = resolveWorkspaceCardSpawnPosition(kind, current);
        const created = createWorkspaceNode(kind, position);
        const next = [...current, created];
        if (!isPreviewCardKind(kind)) return next;
        return reorderPreviewNodesForFront(
          next,
          created.id,
          expandedPreviewNodeIdRef.current,
        );
      });
    },
    [expandedPreviewNodeIdRef, resolveWorkspaceCardSpawnPosition, setNodes],
  );

  const canAddCard = useCallback(
    (kind: WorkspaceCardKind) => {
      return !nodes.some((node) => node.data.kind === kind);
    },
    [nodes],
  );

  const removeWorkspaceCard = useCallback(
    (id: string) => {
      if (expandedPreviewNodeIdRef.current === id) {
        expandedPreviewNodeIdRef.current = null;
        setExpandedPreviewNodeId(null);
      }
      delete previewExpandSnapshotRef.current[id];
      setNodes((current) => {
        const target = current.find((node) => node.id === id);
        if (target) {
          const nextPositions = {
            ...lastWorkspaceCardPositionRef.current,
            [target.data.kind]: {
              x: target.position.x,
              y: target.position.y,
            },
          };
          lastWorkspaceCardPositionRef.current = nextPositions;
          writeWorkspaceCardLastPositions(nextPositions);
          if (target.data.kind.startsWith("preview-irc:")) {
            const channelLogin = target.data.kind
              .slice("preview-irc:".length)
              .trim()
              .toLowerCase();
            if (channelLogin) {
              const currentChannels = readIrcChannels();
              const nextChannels = currentChannels.filter(
                (channel) => channel !== channelLogin,
              );
              if (nextChannels.length !== currentChannels.length) {
                writeIrcChannels(nextChannels);
              }
            }
          }
        }
        return current.filter((node) => node.id !== id);
      });
    },
    [
      expandedPreviewNodeIdRef,
      lastWorkspaceCardPositionRef,
      previewExpandSnapshotRef,
      setExpandedPreviewNodeId,
      setNodes,
    ],
  );

  const handleStartRaidToChannel = useCallback(
    (channel: FollowedChannelRailItem) => startRaidToChannel(channel, streamIsLive),
    [streamIsLive],
  );

  const handleStartShoutoutToChannel = useCallback(
    (channel: FollowedChannelRailItem) =>
      startShoutoutToChannel(channel, streamIsLive),
    [streamIsLive],
  );

  return {
    resolveWorkspaceCardSpawnPosition,
    addIrcPreviewCard,
    addWorkspaceCard,
    canAddCard,
    removeWorkspaceCard,
    handleStartRaidToChannel,
    handleStartShoutoutToChannel,
  };
};
