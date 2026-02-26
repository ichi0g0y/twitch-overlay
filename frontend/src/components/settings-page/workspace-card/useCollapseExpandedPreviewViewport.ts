import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toFiniteNumber } from "./numeric";
import { resolveWorkspaceCardSize } from "./node";
import type {
  PreviewViewportExpandSnapshot,
  WorkspaceCardNode,
} from "./types";

type UseCollapseExpandedPreviewViewportParams = {
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  previewExpandSnapshotRef: MutableRefObject<
    Record<string, PreviewViewportExpandSnapshot>
  >;
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
};

export const useCollapseExpandedPreviewViewport = ({
  expandedPreviewNodeIdRef,
  previewExpandSnapshotRef,
  setNodes,
  setExpandedPreviewNodeId,
}: UseCollapseExpandedPreviewViewportParams) =>
  useCallback(() => {
    const expandedId = expandedPreviewNodeIdRef.current;
    if (!expandedId) return;
    const snapshot = previewExpandSnapshotRef.current[expandedId];

    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (node.id !== expandedId) return node;
        changed = true;
        if (snapshot) {
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
        }
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
      return changed ? next : current;
    });

    delete previewExpandSnapshotRef.current[expandedId];
    expandedPreviewNodeIdRef.current = null;
    setExpandedPreviewNodeId(null);
  }, [
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    setExpandedPreviewNodeId,
    setNodes,
  ]);
