import type { ReactFlowInstance } from "@xyflow/react";
import {
  PREVIEW_EXPANDED_ASPECT_RATIO,
  PREVIEW_EXPANDED_VIEWPORT_FIT_RATIO,
  PREVIEW_NODE_EXPANDED_Z_INDEX,
} from "./constants";
import { isPreviewCardKind } from "./kinds";
import { resolveWorkspaceCardSize } from "./node";
import { toFiniteNumber } from "./numeric";
import type {
  PreviewViewportExpandSnapshot,
  WorkspaceCardNode,
} from "./types";

type ExecuteTogglePreviewViewportExpandInput = {
  nodeId: string;
  forceExpand: boolean;
  nodes: WorkspaceCardNode[];
  snapshots: Record<string, PreviewViewportExpandSnapshot>;
  currentExpandedNodeId: string | null;
  flowInstance: ReactFlowInstance<WorkspaceCardNode> | null;
  setNodes: (nextNodes: WorkspaceCardNode[]) => void;
  setExpandedNodeId: (nodeId: string | null) => void;
  setExpandedNodeIdRef: (nodeId: string | null) => void;
};

export const executeTogglePreviewViewportExpand = ({
  nodeId,
  forceExpand,
  nodes,
  snapshots,
  currentExpandedNodeId,
  flowInstance,
  setNodes,
  setExpandedNodeId,
  setExpandedNodeIdRef,
}: ExecuteTogglePreviewViewportExpandInput) => {
  let next = nodes;
  let changed = false;

  const restoreExpandedNode = (restoreId: string) => {
    const snapshot = snapshots[restoreId];
    if (!snapshot) return;
    let restored = false;
    next = next.map((node) => {
      if (node.id !== restoreId) return node;
      restored = true;
      const restoredStyle = {
        ...(node.style ?? {}),
        width: snapshot.width,
        height: snapshot.height,
      } as Record<string, unknown>;
      delete restoredStyle.zIndex;
      return {
        ...node,
        position: {
          x: snapshot.position.x,
          y: snapshot.position.y,
        },
        width: snapshot.width,
        height: snapshot.height,
        zIndex: Number.isFinite(toFiniteNumber(snapshot.zIndex, Number.NaN))
          ? toFiniteNumber(snapshot.zIndex, Number.NaN)
          : undefined,
        style: restoredStyle,
      };
    });
    if (restored) changed = true;
    delete snapshots[restoreId];
  };

  const restoreExpandedNodeByFallback = (restoreId: string) => {
    next = next.map((node) => {
      if (node.id !== restoreId) return node;
      changed = true;
      const fallback = resolveWorkspaceCardSize(node.data.kind);
      const restoredStyle = {
        ...(node.style ?? {}),
        width: fallback.width,
        height: fallback.height,
      } as Record<string, unknown>;
      delete restoredStyle.zIndex;
      return {
        ...node,
        width: fallback.width,
        height: fallback.height,
        zIndex: undefined,
        style: restoredStyle,
      };
    });
  };

  if (currentExpandedNodeId === nodeId && !forceExpand) {
    restoreExpandedNode(currentExpandedNodeId);
    if (!changed) {
      restoreExpandedNodeByFallback(currentExpandedNodeId);
    }
    delete snapshots[currentExpandedNodeId];
    setExpandedNodeIdRef(null);
    setExpandedNodeId(null);
    if (changed) setNodes(next);
    return;
  }

  if (currentExpandedNodeId && currentExpandedNodeId !== nodeId) {
    restoreExpandedNode(currentExpandedNodeId);
    if (!changed) {
      restoreExpandedNodeByFallback(currentExpandedNodeId);
    }
    delete snapshots[currentExpandedNodeId];
    setExpandedNodeIdRef(null);
    setExpandedNodeId(null);
  }

  if (!flowInstance || typeof window === "undefined") {
    if (changed) setNodes(next);
    return;
  }
  const flowElement = window.document.querySelector(
    ".settings-workspace-flow",
  ) as HTMLElement | null;
  if (!flowElement) {
    if (changed) setNodes(next);
    return;
  }
  const viewportRect = flowElement.getBoundingClientRect();
  if (viewportRect.width <= 0 || viewportRect.height <= 0) {
    if (changed) setNodes(next);
    return;
  }

  const target = next.find((node) => node.id === nodeId);
  if (!target || !isPreviewCardKind(target.data.kind)) {
    if (changed) setNodes(next);
    return;
  }

  const currentWidth = toFiniteNumber(
    target.width,
    toFiniteNumber(
      target.measured?.width,
      toFiniteNumber(
        (target.style as Record<string, unknown> | undefined)?.width,
        resolveWorkspaceCardSize(target.data.kind).width,
      ),
    ),
  );
  const currentHeight = toFiniteNumber(
    target.height,
    toFiniteNumber(
      target.measured?.height,
      toFiniteNumber(
        (target.style as Record<string, unknown> | undefined)?.height,
        resolveWorkspaceCardSize(target.data.kind).height,
      ),
    ),
  );
  const viewport = flowInstance.getViewport();
  const zoom = Math.max(toFiniteNumber(viewport.zoom, 1), 0.01);
  const maxWidth = Math.max(
    1,
    (viewportRect.width * PREVIEW_EXPANDED_VIEWPORT_FIT_RATIO) / zoom,
  );
  const maxHeight = Math.max(
    1,
    (viewportRect.height * PREVIEW_EXPANDED_VIEWPORT_FIT_RATIO) / zoom,
  );
  let expandedWidth = maxWidth;
  let expandedHeight = expandedWidth / PREVIEW_EXPANDED_ASPECT_RATIO;
  if (expandedHeight > maxHeight) {
    expandedHeight = maxHeight;
    expandedWidth = expandedHeight * PREVIEW_EXPANDED_ASPECT_RATIO;
  }

  let flowPosition: { x: number; y: number };
  try {
    const center = flowInstance.screenToFlowPosition({
      x: viewportRect.left + viewportRect.width / 2,
      y: viewportRect.top + viewportRect.height / 2,
    });
    flowPosition = {
      x: center.x - expandedWidth / 2,
      y: center.y - expandedHeight / 2,
    };
  } catch (error) {
    console.warn("failed to calculate preview expand position", error);
    if (changed) setNodes(next);
    return;
  }

  snapshots[nodeId] = {
    position: {
      x: target.position.x,
      y: target.position.y,
    },
    width: currentWidth,
    height: currentHeight,
    zIndex: Number.isFinite(toFiniteNumber(target.zIndex, Number.NaN))
      ? toFiniteNumber(target.zIndex, Number.NaN)
      : undefined,
  };

  next = next.map((node) => {
    if (node.id !== nodeId) return node;
    return {
      ...node,
      position: flowPosition,
      width: expandedWidth,
      height: expandedHeight,
      zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
      style: {
        ...(node.style ?? {}),
        width: expandedWidth,
        height: expandedHeight,
        zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
      },
    };
  });
  setNodes(next);
  setExpandedNodeIdRef(nodeId);
  setExpandedNodeId(nodeId);
};
