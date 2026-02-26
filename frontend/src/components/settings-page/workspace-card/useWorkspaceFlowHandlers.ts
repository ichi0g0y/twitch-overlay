import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import {
  QUICK_CONTROLS_HIDE_DELAY_MS,
  WORKSPACE_CONTROLS_PROXIMITY_PX,
} from "./constants";
import { normalizeWorkspaceViewport } from "./numeric";
import type { WorkspaceCardNode } from "./types";

type UseWorkspaceFlowHandlersParams = {
  setWorkspaceViewport: Dispatch<SetStateAction<Viewport | null>>;
  collapseExpandedPreviewViewport: () => void;
  scrollModeEnabled: boolean;
  deactivatePreviewInteraction: () => void;
  quickControlsHideTimerRef: MutableRefObject<number | null>;
  setIsWorkspaceControlsVisible: Dispatch<SetStateAction<boolean>>;
  workspaceFlowInstanceRef: MutableRefObject<
    ReactFlowInstance<WorkspaceCardNode> | null
  >;
  setIsWorkspaceFlowReady: Dispatch<SetStateAction<boolean>>;
  shouldFitWorkspaceOnInitRef: MutableRefObject<boolean>;
};

export const useWorkspaceFlowHandlers = ({
  setWorkspaceViewport,
  collapseExpandedPreviewViewport,
  scrollModeEnabled,
  deactivatePreviewInteraction,
  quickControlsHideTimerRef,
  setIsWorkspaceControlsVisible,
  workspaceFlowInstanceRef,
  setIsWorkspaceFlowReady,
  shouldFitWorkspaceOnInitRef,
}: UseWorkspaceFlowHandlersParams) => {
  const handleWorkspaceMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      setWorkspaceViewport(normalizeWorkspaceViewport(viewport));
    },
    [setWorkspaceViewport],
  );

  const handleWorkspaceMoveStart = useCallback(() => {
    collapseExpandedPreviewViewport();
    if (!scrollModeEnabled) return;
    deactivatePreviewInteraction();
  }, [
    collapseExpandedPreviewViewport,
    deactivatePreviewInteraction,
    scrollModeEnabled,
  ]);

  const handleWorkspaceMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (quickControlsHideTimerRef.current !== null) {
        window.clearTimeout(quickControlsHideTimerRef.current);
        quickControlsHideTimerRef.current = null;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const fromLeft = event.clientX - rect.left;
      const fromBottom = rect.bottom - event.clientY;
      const nearLeftBottom =
        fromLeft <= WORKSPACE_CONTROLS_PROXIMITY_PX &&
        fromBottom <= WORKSPACE_CONTROLS_PROXIMITY_PX;
      setIsWorkspaceControlsVisible((current) =>
        current === nearLeftBottom ? current : nearLeftBottom,
      );
    },
    [quickControlsHideTimerRef, setIsWorkspaceControlsVisible],
  );

  const handleWorkspaceMouseLeave = useCallback(() => {
    if (quickControlsHideTimerRef.current !== null) {
      window.clearTimeout(quickControlsHideTimerRef.current);
    }
    quickControlsHideTimerRef.current = window.setTimeout(() => {
      setIsWorkspaceControlsVisible(false);
      quickControlsHideTimerRef.current = null;
    }, QUICK_CONTROLS_HIDE_DELAY_MS);
  }, [quickControlsHideTimerRef, setIsWorkspaceControlsVisible]);

  const handleWorkspaceFlowInit = useCallback(
    (instance: ReactFlowInstance<WorkspaceCardNode>) => {
      workspaceFlowInstanceRef.current = instance;
      setIsWorkspaceFlowReady(true);
      if (!shouldFitWorkspaceOnInitRef.current) return;
      shouldFitWorkspaceOnInitRef.current = false;
      window.requestAnimationFrame(() => {
        // Twitch autoplay requires a visible minimum area; avoid initial zoom-out below 1x.
        void instance.fitView({ minZoom: 1, maxZoom: 1 });
      });
    },
    [
      setIsWorkspaceFlowReady,
      shouldFitWorkspaceOnInitRef,
      workspaceFlowInstanceRef,
    ],
  );

  return {
    handleWorkspaceMoveEnd,
    handleWorkspaceMoveStart,
    handleWorkspaceMouseMove,
    handleWorkspaceMouseLeave,
    handleWorkspaceFlowInit,
  };
};
