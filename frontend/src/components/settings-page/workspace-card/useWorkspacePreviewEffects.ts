import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { resolveWorkspaceCardSize } from "./node";
import { toFiniteNumber } from "./numeric";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

type UseWorkspacePreviewEffectsParams = {
  isWorkspaceFlowReady: boolean;
  nodes: WorkspaceCardNode[];
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
  activatePreviewInteraction: (kind: WorkspaceCardKind) => void;
  setPendingPreviewRevealKind: Dispatch<SetStateAction<WorkspaceCardKind | null>>;
};

export const useWorkspacePreviewEffects = ({
  isWorkspaceFlowReady,
  nodes,
  restoredInitialExpandedPreviewRef,
  expandedPreviewNodeIdRef,
  setExpandedPreviewNodeId,
  togglePreviewViewportExpand,
  bringPreviewNodeToFront,
  pendingPreviewRevealKind,
  workspaceFlowInstanceRef,
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

    const fallbackSize = resolveWorkspaceCardSize(target.data.kind);
    const width = toFiniteNumber(target.width, fallbackSize.width);
    const height = toFiniteNumber(target.height, fallbackSize.height);
    const centerX = target.position.x + width / 2;
    const centerY = target.position.y + height / 2;
    const currentZoom = Math.max(
      toFiniteNumber(flowInstance.getViewport().zoom, 1),
      1,
    );
    void flowInstance.setCenter(centerX, centerY, {
      zoom: currentZoom,
      duration: 180,
    });

    setPendingPreviewRevealKind(null);
  }, [
    activatePreviewInteraction,
    bringPreviewNodeToFront,
    isWorkspaceFlowReady,
    nodes,
    pendingPreviewRevealKind,
    setPendingPreviewRevealKind,
    workspaceFlowInstanceRef,
  ]);
};
