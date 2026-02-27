import { createPortal } from "react-dom";
import type { FC, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import { PREVIEW_PORTAL_EXPANDED_Z_INDEX } from "./constants";
import type { PortalRect } from "./types";

type WarningTooltip = {
  message: string;
  x: number;
  y: number;
  fontFamily: string;
};

type WorkspaceCardPortalsProps = {
  isPreviewModalLikeExpanded: boolean;
  shouldPortalPreviewContent: boolean;
  previewPortalRect: PortalRect | null;
  isPreviewPointerInputBlocked: boolean;
  previewPortalZIndex: number;
  previewContentNode: ReactNode;
  warningTooltip: WarningTooltip | null;
  onExpandedBackdropDismiss?: () => void;
};

export const WorkspaceCardPortals: FC<WorkspaceCardPortalsProps> = ({
  isPreviewModalLikeExpanded,
  shouldPortalPreviewContent,
  previewPortalRect,
  isPreviewPointerInputBlocked,
  previewPortalZIndex,
  previewContentNode,
  warningTooltip,
  onExpandedBackdropDismiss,
}) => {
  const handleBackdropWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (typeof document === "undefined") return;
    const backdrop = event.currentTarget;

    // 背景操作は遮断しつつ、ホイールだけ背面へ転送する。
    backdrop.style.pointerEvents = "none";
    const behind = document.elementFromPoint(
      event.clientX,
      event.clientY,
    ) as HTMLElement | null;
    backdrop.style.pointerEvents = "auto";

    if (behind && behind !== backdrop) {
      behind.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        }),
      );
    }

    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {isPreviewModalLikeExpanded &&
        shouldPortalPreviewContent &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-[1.5px]"
            style={{ zIndex: PREVIEW_PORTAL_EXPANDED_Z_INDEX - 1 }}
            onPointerDown={(event) => {
              onExpandedBackdropDismiss?.();
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onWheel={handleBackdropWheel}
          />,
          document.body,
        )}
      {shouldPortalPreviewContent &&
        previewPortalRect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-workspace-preview-portal="content"
            className={`nodrag nowheel relative overflow-hidden ${
              isPreviewModalLikeExpanded
                ? "border border-slate-300/20 bg-gray-950/95 shadow-[0_40px_140px_rgba(0,0,0,0.88),0_0_0_1px_rgba(15,23,42,0.82)]"
                : ""
            } ${isPreviewPointerInputBlocked ? "pointer-events-none select-none" : ""}`}
            style={{
              position: "fixed",
              left: previewPortalRect.left,
              top: previewPortalRect.top,
              width: previewPortalRect.width,
              height: previewPortalRect.height,
              zIndex: previewPortalZIndex,
            }}
          >
            {previewContentNode}
          </div>,
          document.body,
        )}
      {warningTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: warningTooltip.x,
              top: warningTooltip.y,
              width: 288,
              zIndex: 2000,
              fontFamily: warningTooltip.fontFamily,
            }}
            className="pointer-events-none rounded border border-amber-500/40 bg-gray-950 px-2 py-1 text-[11px] leading-relaxed text-amber-200 shadow-lg"
          >
            {warningTooltip.message}
          </div>,
          document.body,
        )}
    </>
  );
};
