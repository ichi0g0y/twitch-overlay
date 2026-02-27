import {
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { SETTINGS_UI_FONT_FAMILY } from "./constants";
import { isZoomActivationPressed } from "./numeric";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

type UseWorkspaceEffectsParams = {
  quickControlsHideTimerRef: MutableRefObject<number | null>;
  scrollModeEnabled: boolean;
  deactivatePreviewInteraction: () => void;
  previewInteractionKind: WorkspaceCardKind | null;
  nodes: WorkspaceCardNode[];
  workspaceShellRef: RefObject<HTMLDivElement>;
  collapseExpandedPreviewViewport: () => void;
  panActivationKeyCode: string;
  zoomActivationKeyCode: string;
  setIsPanKeyActive: Dispatch<SetStateAction<boolean>>;
  setIsZoomActivationKeyActive: Dispatch<SetStateAction<boolean>>;
};

export const useWorkspaceEffects = ({
  quickControlsHideTimerRef,
  scrollModeEnabled,
  deactivatePreviewInteraction,
  previewInteractionKind,
  nodes,
  workspaceShellRef,
  collapseExpandedPreviewViewport,
  panActivationKeyCode,
  zoomActivationKeyCode,
  setIsPanKeyActive,
  setIsZoomActivationKeyActive,
}: UseWorkspaceEffectsParams) => {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previousBodyFontFamily = document.body.style.fontFamily;
    document.body.style.fontFamily = SETTINGS_UI_FONT_FAMILY;
    return () => {
      document.body.style.fontFamily = previousBodyFontFamily;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (quickControlsHideTimerRef.current !== null) {
        window.clearTimeout(quickControlsHideTimerRef.current);
      }
    };
  }, [quickControlsHideTimerRef]);

  useEffect(() => {
    if (!scrollModeEnabled) {
      deactivatePreviewInteraction();
    }
  }, [deactivatePreviewInteraction, scrollModeEnabled]);

  const activePreviewNodeId = useMemo(() => {
    if (!previewInteractionKind) return null;
    return (
      nodes.find((node) => node.data.kind === previewInteractionKind)?.id ??
      null
    );
  }, [nodes, previewInteractionKind]);

  useEffect(() => {
    if (!scrollModeEnabled || !activePreviewNodeId) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const nodeElement = Array.from(
        window.document.querySelectorAll<HTMLElement>(
          ".settings-workspace-flow .react-flow__node",
        ),
      ).find((element) => element.dataset.id === activePreviewNodeId);
      if (!nodeElement) {
        deactivatePreviewInteraction();
        return;
      }
      const rect = nodeElement.getBoundingClientRect();
      const insideNode =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!insideNode) {
        deactivatePreviewInteraction();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
    };
  }, [activePreviewNodeId, deactivatePreviewInteraction, scrollModeEnabled]);

  useEffect(() => {
    const handleWheelCapture = (event: WheelEvent) => {
      const container = workspaceShellRef.current;
      if (!(event.target instanceof Node) || !container?.contains(event.target))
        return;
      collapseExpandedPreviewViewport();
      if (!scrollModeEnabled) return;
      if (!event.cancelable) return;
      // Prevent browser-level back/forward swipe while preserving ReactFlow pan handling.
      event.preventDefault();
    };
    window.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", handleWheelCapture, true);
    };
  }, [collapseExpandedPreviewViewport, scrollModeEnabled, workspaceShellRef]);

  useEffect(() => {
    setIsPanKeyActive(false);
    setIsZoomActivationKeyActive(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === panActivationKeyCode) {
        setIsPanKeyActive(true);
      }
      setIsZoomActivationKeyActive(
        isZoomActivationPressed(event, zoomActivationKeyCode),
      );
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === panActivationKeyCode) {
        setIsPanKeyActive(false);
      }
      setIsZoomActivationKeyActive(
        isZoomActivationPressed(event, zoomActivationKeyCode),
      );
    };
    const handleWindowBlur = () => {
      setIsPanKeyActive(false);
      setIsZoomActivationKeyActive(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    panActivationKeyCode,
    setIsPanKeyActive,
    setIsZoomActivationKeyActive,
    zoomActivationKeyCode,
  ]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);
};
