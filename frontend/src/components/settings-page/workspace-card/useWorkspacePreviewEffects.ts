import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { resolveWorkspaceCardSize } from "./node";
import { toFiniteNumber } from "./numeric";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

const PREVIEW_REVEAL_VISIBLE_RATIO_THRESHOLD = 0.1;

type UseWorkspacePreviewEffectsParams = {
  isWorkspaceFlowReady: boolean;
  nodes: WorkspaceCardNode[];
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
  restoredInitialExpandedPreviewRef: MutableRefObject<boolean>;
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
  togglePreviewViewportExpand: (
    id: string,
    options?: { forceExpand?: boolean },
  ) => void;
  bringPreviewNodeToFront: (nodeId: string) => void;
  pendingPreviewRevealKind: WorkspaceCardKind | null;
  workspaceFlowInstanceRef: RefObject<ReactFlowInstance<WorkspaceCardNode> | null>;
  workspaceShellRef: RefObject<HTMLDivElement | null>;
  activatePreviewInteraction: (kind: WorkspaceCardKind) => void;
  setPendingPreviewRevealKind: Dispatch<SetStateAction<WorkspaceCardKind | null>>;
};

export const useWorkspacePreviewEffects = ({
  isWorkspaceFlowReady,
  nodes,
  setNodes,
  restoredInitialExpandedPreviewRef,
  expandedPreviewNodeIdRef,
  setExpandedPreviewNodeId,
  togglePreviewViewportExpand,
  bringPreviewNodeToFront,
  pendingPreviewRevealKind,
  workspaceFlowInstanceRef,
  workspaceShellRef,
  activatePreviewInteraction,
  setPendingPreviewRevealKind,
}: UseWorkspacePreviewEffectsParams) => {
  useEffect(() => {
    if (restoredInitialExpandedPreviewRef.current) return;
    if (!isWorkspaceFlowReady) return;

    const expandedId = expandedPreviewNodeIdRef.current;
    if (!expandedId) {
      restoredInitialExpandedPreviewRef.current = true;
      return;
    }

    if (!nodes.some((node) => node.id === expandedId)) {
      restoredInitialExpandedPreviewRef.current = true;
      expandedPreviewNodeIdRef.current = null;
      setExpandedPreviewNodeId(null);
      return;
    }

    restoredInitialExpandedPreviewRef.current = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        togglePreviewViewportExpand(expandedId, { forceExpand: true });
      });
    });
  }, [
    expandedPreviewNodeIdRef,
    isWorkspaceFlowReady,
    nodes,
    restoredInitialExpandedPreviewRef,
    setExpandedPreviewNodeId,
    togglePreviewViewportExpand,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      bringPreviewNodeToFront(nodeId);
    };
    window.addEventListener("workspace-preview-bring-to-front", handler);
    return () =>
      window.removeEventListener("workspace-preview-bring-to-front", handler);
  }, [bringPreviewNodeToFront]);

  useEffect(() => {
    if (!pendingPreviewRevealKind) return;
    if (!isWorkspaceFlowReady) return;
    const target = nodes.find(
      (node) => node.data.kind === pendingPreviewRevealKind,
    );
    if (!target) return;
    const flowInstance = workspaceFlowInstanceRef.current;
    if (!flowInstance) return;

    bringPreviewNodeToFront(target.id);
    activatePreviewInteraction(target.data.kind);
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const shouldSelect = node.id === target.id;
        if (Boolean(node.selected) === shouldSelect) return node;
        changed = true;
        return {
          ...node,
          selected: shouldSelect,
        };
      });
      return changed ? next : current;
    });

    const fallbackSize = resolveWorkspaceCardSize(target.data.kind);
    const width = toFiniteNumber(target.width, fallbackSize.width);
    const height = toFiniteNumber(target.height, fallbackSize.height);
    const centerX = target.position.x + width / 2;
    const centerY = target.position.y + height / 2;

    const shellRect = workspaceShellRef.current?.getBoundingClientRect();
    const viewportWidth = Math.max(1, toFiniteNumber(shellRect?.width, 0));
    const viewportHeight = Math.max(1, toFiniteNumber(shellRect?.height, 0));
    const viewport = flowInstance.getViewport();
    const zoom = Math.max(toFiniteNumber(viewport.zoom, 1), 0.01);
    const visibleLeft = -toFiniteNumber(viewport.x, 0) / zoom;
    const visibleTop = -toFiniteNumber(viewport.y, 0) / zoom;
    const visibleRight = visibleLeft + viewportWidth / zoom;
    const visibleBottom = visibleTop + viewportHeight / zoom;
    const nodeLeft = target.position.x;
    const nodeTop = target.position.y;
    const nodeRight = nodeLeft + width;
    const nodeBottom = nodeTop + height;
    const intersectionWidth = Math.max(
      0,
      Math.min(visibleRight, nodeRight) - Math.max(visibleLeft, nodeLeft),
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(visibleBottom, nodeBottom) - Math.max(visibleTop, nodeTop),
    );
    const nodeArea = Math.max(1, width * height);
    const visibleRatio = (intersectionWidth * intersectionHeight) / nodeArea;
    if (visibleRatio < PREVIEW_REVEAL_VISIBLE_RATIO_THRESHOLD) {
      void flowInstance.setCenter(centerX, centerY, { zoom, duration: 180 });
    }

    setPendingPreviewRevealKind(null);
  }, [
    activatePreviewInteraction,
    bringPreviewNodeToFront,
    isWorkspaceFlowReady,
    nodes,
    pendingPreviewRevealKind,
    setNodes,
    setPendingPreviewRevealKind,
    workspaceFlowInstanceRef,
    workspaceShellRef,
  ]);
};
