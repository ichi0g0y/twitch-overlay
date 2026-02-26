import { useMemo, type ComponentProps, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import { WorkspaceFlowCanvas } from "./WorkspaceFlowCanvas";
import { WorkspaceQuickControls } from "./WorkspaceQuickControls";
import type { WorkspaceCardNode } from "./types";

type WorkspaceFlowCanvasProps = ComponentProps<typeof WorkspaceFlowCanvas>;
type WorkspaceQuickControlsProps = ComponentProps<typeof WorkspaceQuickControls>;

type UseWorkspaceCanvasPropsParams = {
  workspaceShellRef: WorkspaceFlowCanvasProps["workspaceShellRef"];
  topBarOffsets: WorkspaceFlowCanvasProps["topBarOffsets"];
  handleWorkspaceMouseMove: WorkspaceFlowCanvasProps["handleWorkspaceMouseMove"];
  handleWorkspaceMouseLeave: WorkspaceFlowCanvasProps["handleWorkspaceMouseLeave"];
  nodes: WorkspaceFlowCanvasProps["nodes"];
  onNodesChange: WorkspaceFlowCanvasProps["onNodesChange"];
  handleWorkspaceNodeClick: WorkspaceFlowCanvasProps["onNodeClick"];
  handleWorkspaceMoveStart: WorkspaceFlowCanvasProps["onMoveStart"];
  handleWorkspaceMoveEnd: WorkspaceFlowCanvasProps["onMoveEnd"];
  handleWorkspaceFlowInit: WorkspaceFlowCanvasProps["onInit"];
  workspaceSnapEnabled: boolean;
  scrollModeEnabled: boolean;
  panActivationKeyCode: string;
  isPanKeyActive: boolean;
  isZoomActivationKeyActive: boolean;
  isWorkspaceControlsVisible: boolean;
  panningSettingsOpen: boolean;
  workspaceViewport: Viewport | null;
  shouldShowQuickControls: boolean;
  quickControlsHideTimerRef: MutableRefObject<number | null>;
  setPanningSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsQuickControlsHovered: Dispatch<SetStateAction<boolean>>;
  setIsWorkspaceControlsVisible: Dispatch<SetStateAction<boolean>>;
  collapseExpandedPreviewViewport: () => void;
  workspaceFlowInstanceRef: MutableRefObject<
    ReactFlowInstance<WorkspaceCardNode> | null
  >;
  setWorkspaceSnapEnabled: Dispatch<SetStateAction<boolean>>;
  handleSettingChange: (
    key: string,
    value: string,
    saveImmediately?: boolean,
  ) => void;
  zoomActivationKeyCode: string;
  previewPortalEnabled: boolean;
};

export const useWorkspaceCanvasProps = ({
  workspaceShellRef,
  topBarOffsets,
  handleWorkspaceMouseMove,
  handleWorkspaceMouseLeave,
  nodes,
  onNodesChange,
  handleWorkspaceNodeClick,
  handleWorkspaceMoveStart,
  handleWorkspaceMoveEnd,
  handleWorkspaceFlowInit,
  workspaceSnapEnabled,
  scrollModeEnabled,
  panActivationKeyCode,
  isPanKeyActive,
  isZoomActivationKeyActive,
  isWorkspaceControlsVisible,
  panningSettingsOpen,
  workspaceViewport,
  shouldShowQuickControls,
  quickControlsHideTimerRef,
  setPanningSettingsOpen,
  setIsQuickControlsHovered,
  setIsWorkspaceControlsVisible,
  collapseExpandedPreviewViewport,
  workspaceFlowInstanceRef,
  setWorkspaceSnapEnabled,
  handleSettingChange,
  zoomActivationKeyCode,
  previewPortalEnabled,
}: UseWorkspaceCanvasPropsParams) => {
  const flowCanvasProps = useMemo<WorkspaceFlowCanvasProps>(
    () => ({
      workspaceShellRef,
      topBarOffsets,
      handleWorkspaceMouseMove,
      handleWorkspaceMouseLeave,
      nodes,
      onNodesChange,
      onNodeClick: handleWorkspaceNodeClick,
      onMoveStart: handleWorkspaceMoveStart,
      onMoveEnd: handleWorkspaceMoveEnd,
      onInit: handleWorkspaceFlowInit,
      workspaceSnapEnabled,
      scrollModeEnabled,
      panActivationKeyCode,
      isPanKeyActive,
      isZoomActivationKeyActive,
      isWorkspaceControlsVisible,
      panningSettingsOpen,
      workspaceViewport,
    }),
    [
      handleWorkspaceFlowInit,
      handleWorkspaceMouseLeave,
      handleWorkspaceMouseMove,
      handleWorkspaceMoveEnd,
      handleWorkspaceMoveStart,
      handleWorkspaceNodeClick,
      isPanKeyActive,
      isWorkspaceControlsVisible,
      isZoomActivationKeyActive,
      nodes,
      onNodesChange,
      panActivationKeyCode,
      panningSettingsOpen,
      scrollModeEnabled,
      topBarOffsets,
      workspaceShellRef,
      workspaceSnapEnabled,
      workspaceViewport,
    ],
  );

  const quickControlsProps = useMemo<WorkspaceQuickControlsProps>(
    () => ({
      shouldShowQuickControls,
      leftOffset: topBarOffsets.left + 12,
      panningSettingsOpen,
      setPanningSettingsOpen,
      quickControlsHideTimerRef,
      setIsQuickControlsHovered,
      setIsWorkspaceControlsVisible,
      collapseExpandedPreviewViewport,
      workspaceFlowInstanceRef,
      setWorkspaceSnapEnabled,
      workspaceSnapEnabled,
      scrollModeEnabled,
      handleSettingChange,
      panActivationKeyCode,
      zoomActivationKeyCode,
      previewPortalEnabled,
    }),
    [
      collapseExpandedPreviewViewport,
      handleSettingChange,
      panActivationKeyCode,
      panningSettingsOpen,
      previewPortalEnabled,
      quickControlsHideTimerRef,
      scrollModeEnabled,
      setIsQuickControlsHovered,
      setIsWorkspaceControlsVisible,
      setPanningSettingsOpen,
      setWorkspaceSnapEnabled,
      shouldShowQuickControls,
      topBarOffsets.left,
      workspaceFlowInstanceRef,
      workspaceSnapEnabled,
      zoomActivationKeyCode,
    ],
  );

  return {
    flowCanvasProps,
    quickControlsProps,
  };
};
