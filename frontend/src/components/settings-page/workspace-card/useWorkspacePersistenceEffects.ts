import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Viewport } from "@xyflow/react";
import {
  writeWorkspaceFlow,
  writeWorkspacePreviewExpandState,
} from "./storage";
import type { PreviewViewportExpandSnapshot, WorkspaceCardNode } from "./types";

type UseWorkspacePersistenceEffectsParams = {
  nodes: WorkspaceCardNode[];
  workspaceViewport: Viewport | null;
  expandedPreviewNodeId: string | null;
  expandedPreviewNodeIdRef: MutableRefObject<string | null>;
  previewExpandSnapshotRef: MutableRefObject<
    Record<string, PreviewViewportExpandSnapshot>
  >;
  setExpandedPreviewNodeId: Dispatch<SetStateAction<string | null>>;
};

export const useWorkspacePersistenceEffects = ({
  nodes,
  workspaceViewport,
  expandedPreviewNodeId,
  expandedPreviewNodeIdRef,
  previewExpandSnapshotRef,
  setExpandedPreviewNodeId,
}: UseWorkspacePersistenceEffectsParams) => {
  useEffect(() => {
    const expandedId = expandedPreviewNodeIdRef.current;
    const nodeIds = new Set(nodes.map((node) => node.id));
    let snapshotsChanged = false;
    for (const snapshotId of Object.keys(previewExpandSnapshotRef.current)) {
      if (nodeIds.has(snapshotId)) continue;
      delete previewExpandSnapshotRef.current[snapshotId];
      snapshotsChanged = true;
    }
    if (!expandedId) {
      if (snapshotsChanged) {
        writeWorkspacePreviewExpandState(
          null,
          previewExpandSnapshotRef.current,
        );
      }
      return;
    }
    if (nodeIds.has(expandedId)) return;
    delete previewExpandSnapshotRef.current[expandedId];
    expandedPreviewNodeIdRef.current = null;
    setExpandedPreviewNodeId(null);
    writeWorkspacePreviewExpandState(null, previewExpandSnapshotRef.current);
  }, [expandedPreviewNodeIdRef, nodes, previewExpandSnapshotRef, setExpandedPreviewNodeId]);

  useEffect(() => {
    writeWorkspacePreviewExpandState(
      expandedPreviewNodeId,
      previewExpandSnapshotRef.current,
    );
  }, [expandedPreviewNodeId, nodes, previewExpandSnapshotRef]);

  useEffect(() => {
    writeWorkspaceFlow(
      nodes,
      workspaceViewport,
      expandedPreviewNodeIdRef.current,
      previewExpandSnapshotRef.current,
    );
  }, [expandedPreviewNodeIdRef, nodes, previewExpandSnapshotRef, workspaceViewport]);
};
