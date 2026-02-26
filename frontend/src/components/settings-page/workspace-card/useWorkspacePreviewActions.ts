import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { WORKSPACE_SNAP_GRID } from "./constants";
import { isPreviewCardKind } from "./kinds";
import {
  reorderPreviewNodesForFront,
  resolveWorkspaceCardMinSize,
} from "./node";
import { executeTogglePreviewViewportExpand } from "./previewExpand";
import type {
  PreviewViewportExpandSnapshot,
  WorkspaceCardKind,
  WorkspaceCardNode,
} from "./types";

type UseWorkspacePreviewActionsParams = {
  nodes: WorkspaceCardNode[];
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
  workspaceSnapEnabled: boolean;
  expandedPreviewNodeId: string | null;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  previewExpandSnapshotRef: MutableRefObject<
    Record<string, PreviewViewportExpandSnapshot>
  >;
  workspaceFlowInstanceRef: RefObject<ReactFlowInstance<WorkspaceCardNode> | null>;
  scrollModeEnabled: boolean;
  previewInteractionKind: WorkspaceCardKind | null;
  setPreviewInteractionKind: Dispatch<SetStateAction<WorkspaceCardKind | null>>;
  setPreviewReloadNonceByKind: Dispatch<SetStateAction<Record<string, number>>>;
  setPreviewWarningByKind: Dispatch<
    SetStateAction<Partial<Record<WorkspaceCardKind, string>>>
  >;
};

export const useWorkspacePreviewActions = ({
  nodes,
  setNodes,
  workspaceSnapEnabled,
  expandedPreviewNodeId,
  setExpandedPreviewNodeId,
  expandedPreviewNodeIdRef,
  previewExpandSnapshotRef,
  workspaceFlowInstanceRef,
  scrollModeEnabled,
  previewInteractionKind,
  setPreviewInteractionKind,
  setPreviewReloadNonceByKind,
  setPreviewWarningByKind,
}: UseWorkspacePreviewActionsParams) => {
  const deactivatePreviewInteraction = useCallback(() => {
    setPreviewInteractionKind(null);
  }, [setPreviewInteractionKind]);

  const activatePreviewInteraction = useCallback(
    (kind: WorkspaceCardKind) => {
      if (!scrollModeEnabled) return;
      setPreviewInteractionKind(kind);
    },
    [scrollModeEnabled, setPreviewInteractionKind],
  );

  const snapWorkspaceCardSize = useCallback(
    (id: string, width: number, height: number) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== id) return node;
          const minSize = resolveWorkspaceCardMinSize(node.data.kind);
          const snappedWidth = workspaceSnapEnabled
            ? Math.max(
                minSize.minWidth,
                Math.round(width / WORKSPACE_SNAP_GRID[0]) * WORKSPACE_SNAP_GRID[0],
              )
            : Math.max(minSize.minWidth, Math.round(width));
          const snappedHeight = workspaceSnapEnabled
            ? Math.max(
                minSize.minHeight,
                Math.round(height / WORKSPACE_SNAP_GRID[1]) * WORKSPACE_SNAP_GRID[1],
              )
            : Math.max(minSize.minHeight, Math.round(height));
          if (node.width === snappedWidth && node.height === snappedHeight)
            return node;
          return {
            ...node,
            width: snappedWidth,
            height: snappedHeight,
            style: {
              ...(node.style ?? {}),
              width: snappedWidth,
              height: snappedHeight,
            },
          };
        }),
      );
    },
    [setNodes, workspaceSnapEnabled],
  );

  const togglePreviewViewportExpand = useCallback(
    (id: string, options?: { forceExpand?: boolean }) => {
      executeTogglePreviewViewportExpand({
        nodeId: id,
        forceExpand: options?.forceExpand ?? false,
        nodes,
        snapshots: previewExpandSnapshotRef.current,
        currentExpandedNodeId: expandedPreviewNodeIdRef.current,
        flowInstance: workspaceFlowInstanceRef.current,
        setNodes,
        setExpandedNodeId: setExpandedPreviewNodeId,
        setExpandedNodeIdRef: (nextId) => {
          expandedPreviewNodeIdRef.current = nextId;
        },
      });
    },
    [
      nodes,
      previewExpandSnapshotRef,
      expandedPreviewNodeIdRef,
      workspaceFlowInstanceRef,
      setNodes,
      setExpandedPreviewNodeId,
    ],
  );

  const bringPreviewNodeToFront = useCallback(
    (nodeId: string) => {
      setNodes((current) =>
        reorderPreviewNodesForFront(
          current,
          nodeId,
          expandedPreviewNodeIdRef.current,
        ),
      );
    },
    [setNodes, expandedPreviewNodeIdRef],
  );

  const isPreviewViewportExpanded = useCallback(
    (id: string) => expandedPreviewNodeId === id,
    [expandedPreviewNodeId],
  );

  const refreshPreview = useCallback(
    (kind: WorkspaceCardKind) => {
      if (!isPreviewCardKind(kind)) return;
      setPreviewReloadNonceByKind((current) => ({
        ...current,
        [kind]: (current[kind] ?? 0) + 1,
      }));
    },
    [setPreviewReloadNonceByKind],
  );

  const setPreviewWarning = useCallback(
    (kind: WorkspaceCardKind, warningMessage: string | null) => {
      setPreviewWarningByKind((current) => {
        const normalized = warningMessage?.trim() || null;
        const previous = current[kind] ?? null;
        if (previous === normalized) return current;
        if (!normalized) {
          if (!(kind in current)) return current;
          const next = { ...current };
          delete next[kind];
          return next;
        }
        return {
          ...current,
          [kind]: normalized,
        };
      });
    },
    [setPreviewWarningByKind],
  );

  const isPreviewInteractionEnabled = useCallback(
    (kind: WorkspaceCardKind) => {
      if (!scrollModeEnabled) return true;
      return previewInteractionKind === kind;
    },
    [previewInteractionKind, scrollModeEnabled],
  );

  const togglePreviewInteraction = useCallback(
    (kind: WorkspaceCardKind) => {
      if (!scrollModeEnabled) return;
      if (previewInteractionKind === kind) {
        deactivatePreviewInteraction();
        return;
      }
      activatePreviewInteraction(kind);
    },
    [
      activatePreviewInteraction,
      deactivatePreviewInteraction,
      previewInteractionKind,
      scrollModeEnabled,
    ],
  );

  return {
    deactivatePreviewInteraction,
    activatePreviewInteraction,
    snapWorkspaceCardSize,
    togglePreviewViewportExpand,
    bringPreviewNodeToFront,
    isPreviewViewportExpanded,
    refreshPreview,
    setPreviewWarning,
    isPreviewInteractionEnabled,
    togglePreviewInteraction,
  };
};
