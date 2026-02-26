import { useCallback, useEffect, useState, type RefObject } from "react";
import type { PortalRect } from "./types";

type WarningTooltipState = {
  message: string;
  x: number;
  y: number;
  fontFamily: string;
};

export const useWarningTooltip = () => {
  const [warningTooltip, setWarningTooltip] =
    useState<WarningTooltipState | null>(null);

  const hideWarningTooltip = useCallback(() => {
    setWarningTooltip(null);
  }, []);

  const showWarningTooltip = useCallback(
    (target: HTMLElement, message: string) => {
      if (typeof window === "undefined") return;
      const rect = target.getBoundingClientRect();
      const { fontFamily } = window.getComputedStyle(target);
      const tooltipWidth = 288;
      const x = Math.max(
        8,
        Math.min(window.innerWidth - tooltipWidth - 8, rect.right - tooltipWidth),
      );
      const y = rect.bottom + 8;
      setWarningTooltip({ message, x, y, fontFamily });
    },
    [],
  );

  useEffect(() => {
    if (!warningTooltip) return undefined;
    const hide = () => setWarningTooltip(null);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [warningTooltip]);

  return { warningTooltip, hideWarningTooltip, showWarningTooltip };
};

export const usePreviewPortalRect = (
  shouldPortalPreviewContent: boolean,
  previewContentHostRef: RefObject<HTMLDivElement | null>,
) => {
  const [previewPortalRect, setPreviewPortalRect] = useState<PortalRect | null>(
    null,
  );

  useEffect(() => {
    if (!shouldPortalPreviewContent) {
      setPreviewPortalRect(null);
      return undefined;
    }

    let rafId = 0;
    let isDisposed = false;
    let lastSerializedRect = "";

    const updateRect = () => {
      if (isDisposed) return;
      const host = previewContentHostRef.current;
      if (!host) {
        rafId = window.requestAnimationFrame(updateRect);
        return;
      }
      const rect = host.getBoundingClientRect();
      const nextRect = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      const serialized = `${nextRect.left}:${nextRect.top}:${nextRect.width}:${nextRect.height}`;
      if (serialized !== lastSerializedRect) {
        lastSerializedRect = serialized;
        setPreviewPortalRect(
          nextRect.width > 0 && nextRect.height > 0 ? nextRect : null,
        );
      }
      rafId = window.requestAnimationFrame(updateRect);
    };

    rafId = window.requestAnimationFrame(updateRect);
    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [previewContentHostRef, shouldPortalPreviewContent]);

  return previewPortalRect;
};
