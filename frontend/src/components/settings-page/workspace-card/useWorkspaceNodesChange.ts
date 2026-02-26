import type { NodeChange } from "@xyflow/react";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PREVIEW_NODE_EXPANDED_Z_INDEX } from "./constants";
import { toFiniteNumber } from "./numeric";
import type { WorkspaceCardNode } from "./types";

type UseWorkspaceNodesChangeParams = {
  onNodesChangeRaw: (changes: NodeChange<WorkspaceCardNode>[]) => void;
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
};

export const useWorkspaceNodesChange = ({
  onNodesChangeRaw,
  expandedPreviewNodeIdRef,
  setNodes,
}: UseWorkspaceNodesChangeParams) =>
  useCallback(
    (changes: NodeChange<WorkspaceCardNode>[]) => {
      onNodesChangeRaw(changes);
      const expandedNodeId = expandedPreviewNodeIdRef.current;
      if (!expandedNodeId) return;
      setNodes((current) => {
        let changed = false;
        const next = current.map((node) => {
          if (node.id !== expandedNodeId) return node;
          const styleZIndex = toFiniteNumber(
            (node.style as Record<string, unknown> | undefined)?.zIndex,
            Number.NaN,
          );
          const hasExpandedNodeZIndex =
            node.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX;
          const hasExpandedStyleZIndex =
            Number.isFinite(styleZIndex) &&
            styleZIndex === PREVIEW_NODE_EXPANDED_Z_INDEX;
          if (hasExpandedNodeZIndex && hasExpandedStyleZIndex) return node;
          changed = true;
          return {
            ...node,
            zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
            style: {
              ...(node.style ?? {}),
              zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
            },
          };
        });
        return changed ? next : current;
      });
    },
    [expandedPreviewNodeIdRef, onNodesChangeRaw, setNodes],
  );
