import {
  Background,
  ReactFlow,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import type { FC, RefObject, MouseEvent as ReactMouseEvent } from "react";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  WORKSPACE_FLOW_MAX_ZOOM,
  WORKSPACE_FLOW_MIN_ZOOM,
  WORKSPACE_SNAP_GRID,
} from "./constants";
import { WORKSPACE_NODE_TYPES } from "./WorkspaceCardNodeView";
import type { WorkspaceCardNode } from "./types";

type WorkspaceFlowCanvasProps = {
  workspaceShellRef: RefObject<HTMLDivElement | null>;
  topBarOffsets: { left: number; right: number };
  handleWorkspaceMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleWorkspaceMouseLeave: () => void;
  nodes: WorkspaceCardNode[];
  onNodesChange: (changes: NodeChange<WorkspaceCardNode>[]) => void;
  onNodeClick: (_event: ReactMouseEvent, node: WorkspaceCardNode) => void;
  onMoveStart: () => void;
  onMoveEnd: (_: MouseEvent | TouchEvent | null, viewport: Viewport) => void;
  onInit: (instance: ReactFlowInstance<WorkspaceCardNode>) => void;
  workspaceSnapEnabled: boolean;
  scrollModeEnabled: boolean;
  panActivationKeyCode: string;
  isPanKeyActive: boolean;
  isZoomActivationKeyActive: boolean;
  isWorkspaceControlsVisible: boolean;
  panningSettingsOpen: boolean;
  workspaceViewport: Viewport | null;
};

export const WorkspaceFlowCanvas: FC<WorkspaceFlowCanvasProps> = ({
  workspaceShellRef,
  topBarOffsets,
  handleWorkspaceMouseMove,
  handleWorkspaceMouseLeave,
  nodes,
  onNodesChange,
  onNodeClick,
  onMoveStart,
  onMoveEnd,
  onInit,
  workspaceSnapEnabled,
  scrollModeEnabled,
  panActivationKeyCode,
  isPanKeyActive,
  isZoomActivationKeyActive,
  isWorkspaceControlsVisible,
  panningSettingsOpen,
  workspaceViewport,
}) => {
  return (
    <div
      ref={workspaceShellRef}
      className="fixed inset-0 z-0 top-[45px] xl:left-[var(--rf-flow-left)] xl:right-[var(--rf-flow-right)]"
      style={
        {
          "--rf-flow-left": `${topBarOffsets.left}px`,
          "--rf-flow-right": `${topBarOffsets.right}px`,
        } as React.CSSProperties
      }
      onMouseMoveCapture={handleWorkspaceMouseMove}
      onMouseLeave={handleWorkspaceMouseLeave}
    >
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onInit={onInit}
        nodeTypes={WORKSPACE_NODE_TYPES}
        minZoom={WORKSPACE_FLOW_MIN_ZOOM}
        maxZoom={WORKSPACE_FLOW_MAX_ZOOM}
        snapToGrid={workspaceSnapEnabled}
        snapGrid={WORKSPACE_SNAP_GRID}
        panOnDrag={[0, 1]}
        panOnScroll={scrollModeEnabled}
        zoomOnScroll={!scrollModeEnabled}
        noWheelClassName={scrollModeEnabled ? "nowheel-disabled" : "nowheel"}
        panActivationKeyCode={panActivationKeyCode}
        data-pan-key-active={
          isPanKeyActive || isZoomActivationKeyActive ? "true" : undefined
        }
        data-controls-visible={
          isWorkspaceControlsVisible || panningSettingsOpen ? "true" : undefined
        }
        defaultViewport={workspaceViewport ?? DEFAULT_WORKSPACE_VIEWPORT}
        className="settings-workspace-flow bg-slate-950"
        colorMode="dark"
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={WORKSPACE_SNAP_GRID[0]} size={1} />
      </ReactFlow>
    </div>
  );
};
