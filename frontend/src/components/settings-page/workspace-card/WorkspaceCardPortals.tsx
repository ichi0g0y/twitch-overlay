import { createPortal } from "react-dom";
import type { FC, ReactNode } from "react";
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
};

export const WorkspaceCardPortals: FC<WorkspaceCardPortalsProps> = ({
  isPreviewModalLikeExpanded,
  shouldPortalPreviewContent,
  previewPortalRect,
  isPreviewPointerInputBlocked,
  previewPortalZIndex,
  previewContentNode,
  warningTooltip,
}) => (
  <>
    {isPreviewModalLikeExpanded &&
      shouldPortalPreviewContent &&
      typeof document !== "undefined" &&
      createPortal(
        <div
          className="pointer-events-none fixed inset-0 bg-black/60 backdrop-blur-[1.5px]"
          style={{ zIndex: PREVIEW_PORTAL_EXPANDED_Z_INDEX - 1 }}
        />,
        document.body,
      )}
    {shouldPortalPreviewContent &&
      previewPortalRect &&
      typeof document !== "undefined" &&
      createPortal(
        <div
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
