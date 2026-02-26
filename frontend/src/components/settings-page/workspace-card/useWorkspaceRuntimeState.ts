import {
  useNodesState,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useMemo, useRef } from "react";
import { createWorkspaceNode } from "./node";
import {
  readWorkspaceCardLastPositions,
  readWorkspaceFlow,
  readWorkspacePreviewExpandState,
} from "./storage";
import {
  useWorkspaceLocalState,
} from "./useWorkspaceLocalState";
import { useWorkspaceNodesChange } from "./useWorkspaceNodesChange";
import { useWorkspaceSettingsBindings } from "./useWorkspaceSettingsBindings";
import type {
  PreviewViewportExpandSnapshot,
  WorkspaceCardKind,
  WorkspaceCardNode,
} from "./types";

export const useWorkspaceRuntimeState = () => {
  const settings = useWorkspaceSettingsBindings();
  const initialWorkspaceFlow = useMemo(() => readWorkspaceFlow(), []);
  const initialWorkspaceCardLastPositions = useMemo(
    () => readWorkspaceCardLastPositions(),
    [],
  );
  const initialPreviewExpandState = useMemo(
    () => readWorkspacePreviewExpandState(),
    [],
  );
  const state = useWorkspaceLocalState({
    initialWorkspaceFlow,
    initialPreviewExpandState,
  });

  const initialWorkspace = useMemo(() => {
    if (initialWorkspaceFlow && initialWorkspaceFlow.nodes.length > 0) {
      return initialWorkspaceFlow.nodes;
    }
    return [
      createWorkspaceNode("preview-main", { x: 140, y: 120 }),
      createWorkspaceNode("general-basic", { x: 860, y: 120 }),
    ];
  }, [initialWorkspaceFlow]);
  const [nodes, setNodes, onNodesChangeRaw] =
    useNodesState<WorkspaceCardNode>(initialWorkspace);

  const workspaceShellRef = useRef<HTMLDivElement | null>(null);
  const quickControlsHideTimerRef = useRef<number | null>(null);
  const shouldFitWorkspaceOnInitRef = useRef(
    initialWorkspaceFlow?.viewport == null,
  );
  const workspaceFlowInstanceRef =
    useRef<ReactFlowInstance<WorkspaceCardNode> | null>(null);
  const lastWorkspaceCardPositionRef = useRef<
    Partial<Record<WorkspaceCardKind, { x: number; y: number }>>
  >(initialWorkspaceCardLastPositions);
  const expandedPreviewNodeIdRef = useRef<string | null>(
    initialPreviewExpandState.expandedNodeId,
  );
  const previewExpandSnapshotRef = useRef<
    Record<string, PreviewViewportExpandSnapshot>
  >(initialPreviewExpandState.snapshots);
  const restoredInitialExpandedPreviewRef = useRef(false);

  const onNodesChange = useWorkspaceNodesChange({
    onNodesChangeRaw,
    expandedPreviewNodeIdRef,
    setNodes,
  });

  return {
    settings,
    state,
    nodes,
    setNodes,
    onNodesChange,
    workspaceShellRef,
    quickControlsHideTimerRef,
    shouldFitWorkspaceOnInitRef,
    workspaceFlowInstanceRef,
    lastWorkspaceCardPositionRef,
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    restoredInitialExpandedPreviewRef,
  };
};
