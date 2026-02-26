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
import { toFiniteNumber } from "./numeric";
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
  const resolvePreviewReferenceSize = useCallback(
    (kind: WorkspaceCardKind, existingNodes: WorkspaceCardNode[]) => {
      if (!isPreviewCardKind(kind)) return null;
      const expandedNodeId = expandedPreviewNodeIdRef.current;
      const previewNodes = existingNodes.filter((node) =>
        isPreviewCardKind(node.data.kind),
      );
      if (previewNodes.length === 0) return null;
      const activePreviewNodes = previewNodes.filter(
        (node) => node.selected === true,
      );
      const activeSourcePool = activePreviewNodes.some(
        (node) => node.id !== expandedNodeId,
      )
        ? activePreviewNodes.filter((node) => node.id !== expandedNodeId)
        : activePreviewNodes;
      const sourcePool =
        activeSourcePool.length > 0
          ? activeSourcePool
          : previewNodes.some((node) => node.id !== expandedNodeId)
            ? previewNodes.filter((node) => node.id !== expandedNodeId)
            : previewNodes;
      const candidate = [...sourcePool].sort((a, b) => {
        const aZ = toFiniteNumber(a.zIndex, Number.NEGATIVE_INFINITY);
        const bZ = toFiniteNumber(b.zIndex, Number.NEGATIVE_INFINITY);
        if (aZ === bZ) return a.id.localeCompare(b.id);
        return bZ - aZ;
      })[0];

      if (candidate.id === expandedNodeId) {
        const snapshot = previewExpandSnapshotRef.current[candidate.id];
        if (snapshot) {
          return { width: snapshot.width, height: snapshot.height };
        }
        const restoredFallback = resolveWorkspaceCardSize(candidate.data.kind);
        return {
          width: restoredFallback.width,
          height: restoredFallback.height,
        };
      }

      const fallback = resolveWorkspaceCardSize(candidate.data.kind);
      const width = toFiniteNumber(
        candidate.width,
        toFiniteNumber(
          candidate.measured?.width,
          toFiniteNumber(
            (candidate.style as Record<string, unknown> | undefined)?.width,
            fallback.width,
          ),
        ),
      );
      const height = toFiniteNumber(
        candidate.height,
        toFiniteNumber(
          candidate.measured?.height,
          toFiniteNumber(
            (candidate.style as Record<string, unknown> | undefined)?.height,
            fallback.height,
          ),
        ),
      );
      return { width, height };
    },
    [expandedPreviewNodeIdRef, previewExpandSnapshotRef],
  );

  const resolveWorkspaceCardSpawnPosition = useCallback(
    (
      kind: WorkspaceCardKind,
      existingNodes: WorkspaceCardNode[],
      options: {
        size?: { width: number; height: number };
      } = {},
    ) => {
      const existingCount = existingNodes.length;
      const remembered = lastWorkspaceCardPositionRef.current[kind];
      if (remembered) {
        return findAvailableWorkspaceCardPosition(
          kind,
          remembered,
          existingNodes,
          options,
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
          options,
        );
      }

      try {
        const base = instance.screenToFlowPosition({
          x: Math.max(0, Math.floor(window.innerWidth / 2)),
          y: Math.max(0, Math.floor(window.innerHeight / 2)),
        });
        const size = options.size ?? resolveWorkspaceCardSize(kind);
        const shift = (existingCount % 6) * 24;
        return findAvailableWorkspaceCardPosition(
          kind,
          {
            x: base.x - size.width / 2 + shift,
            y: base.y - size.height / 2 + Math.floor(existingCount / 6) * 24,
          },
          existingNodes,
          options,
        );
      } catch {
        return findAvailableWorkspaceCardPosition(
          kind,
          fallback,
          existingNodes,
          options,
        );
      }
    },
    [lastWorkspaceCardPositionRef, workspaceFlowInstanceRef],
  );

  const connectIrcChannel = useCallback((channelLogin: string) => {
    const normalized = (channelLogin || "").trim().toLowerCase();
    if (!normalized) return false;
    const current = readIrcChannels();
    const next = appendIrcChannel(current, normalized);
    const isConnected = next.includes(normalized);
    if (!isConnected) return false;
    if (next.length !== current.length || next.some((channel, index) => channel !== current[index])) {
      writeIrcChannels(next);
    }
    return true;
  }, []);

  const addIrcPreviewCard = useCallback(
    (channelLogin: string, options?: { reveal?: boolean }) => {
      const normalized = (channelLogin || "").trim().toLowerCase();
      if (!normalized) return;
      const shouldReveal = options?.reveal ?? true;
      if (!connectIrcChannel(normalized)) return;
      const previewKind = `preview-irc:${normalized}` as WorkspaceCardKind;
      setNodes((existing) => {
        if (existing.some((node) => node.data.kind === previewKind))
          return existing;
        const referencedSize = resolvePreviewReferenceSize(previewKind, existing);
        const position = resolveWorkspaceCardSpawnPosition(previewKind, existing, {
          size: referencedSize ?? undefined,
        });
        const created = createWorkspaceNode(previewKind, position, {
          width: referencedSize?.width,
          height: referencedSize?.height,
        });
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
      resolvePreviewReferenceSize,
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
        const referencedSize = resolvePreviewReferenceSize(kind, current);
        const position = resolveWorkspaceCardSpawnPosition(kind, current, {
          size: referencedSize ?? undefined,
        });
        const created = createWorkspaceNode(kind, position, {
          width: referencedSize?.width,
          height: referencedSize?.height,
        });
        const next = [...current, created];
        if (!isPreviewCardKind(kind)) return next;
        return reorderPreviewNodesForFront(
          next,
          created.id,
          expandedPreviewNodeIdRef.current,
        );
      });
    },
    [
      expandedPreviewNodeIdRef,
      resolvePreviewReferenceSize,
      resolveWorkspaceCardSpawnPosition,
      setNodes,
    ],
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
