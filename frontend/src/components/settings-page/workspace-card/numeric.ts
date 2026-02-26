import type { Viewport } from "@xyflow/react";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  WORKSPACE_FLOW_MAX_ZOOM,
  WORKSPACE_FLOW_MIN_ZOOM,
} from "./constants";

export const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const clampWorkspaceZoom = (value: unknown, fallback: number) => {
  const parsed = toFiniteNumber(value, fallback);
  return Math.min(
    WORKSPACE_FLOW_MAX_ZOOM,
    Math.max(WORKSPACE_FLOW_MIN_ZOOM, parsed),
  );
};

export const normalizeWorkspaceViewport = (viewport: {
  x: unknown;
  y: unknown;
  zoom: unknown;
}): Viewport => ({
  x: toFiniteNumber(viewport.x, DEFAULT_WORKSPACE_VIEWPORT.x),
  y: toFiniteNumber(viewport.y, DEFAULT_WORKSPACE_VIEWPORT.y),
  zoom: clampWorkspaceZoom(viewport.zoom, DEFAULT_WORKSPACE_VIEWPORT.zoom),
});

export const readStoredWorkspaceViewport = (value: unknown): Viewport | null => {
  if (!value || typeof value !== "object") return null;
  const viewport = value as Record<string, unknown>;
  if (!Number.isFinite(Number(viewport.zoom))) return null;
  return normalizeWorkspaceViewport({
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  });
};

export const normalizeWorkspaceZoomActivationKeyCode = (
  value: string,
): string => {
  if (value === "Ctrl") return "Control";
  return value;
};

export const isZoomActivationPressed = (
  event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
  modifier: string,
): boolean => {
  if (modifier === "Control") return event.ctrlKey;
  if (modifier === "Shift") return event.shiftKey;
  if (modifier === "Alt") return event.altKey;
  if (modifier === "Meta") return event.metaKey;
  return false;
};
