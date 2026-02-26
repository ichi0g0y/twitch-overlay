import type { Viewport } from "@xyflow/react";
import {
  WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY,
  WORKSPACE_FLOW_STORAGE_KEY,
  WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY,
} from "./constants";
import { normalizeWorkspaceCardKind, isWorkspaceCardKind } from "./kinds";
import { resolveWorkspaceCardSize, createWorkspaceNode } from "./node";
import { normalizeWorkspaceViewport, readStoredWorkspaceViewport, toFiniteNumber } from "./numeric";
import type {
  PreviewViewportExpandSnapshot,
  StoredWorkspaceCardLastPositionsPayload,
  StoredWorkspaceFlowPayload,
  StoredWorkspacePreviewExpandStatePayload,
  WorkspaceCardKind,
  WorkspaceCardNode,
} from "./types";

export const readWorkspaceCardLastPositions = (): Partial<
  Record<WorkspaceCardKind, { x: number; y: number }>
> => {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(
    WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY,
  );
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoredWorkspaceCardLastPositionsPayload;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Partial<Record<WorkspaceCardKind, { x: number; y: number }>> =
      {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isWorkspaceCardKind(key)) continue;
      if (!value || typeof value !== "object") continue;
      const x = toFiniteNumber((value as { x?: unknown }).x, Number.NaN);
      const y = toFiniteNumber((value as { y?: unknown }).y, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      result[key] = { x, y };
    }
    return result;
  } catch {
    return {};
  }
};

export const writeWorkspaceCardLastPositions = (
  positions: Partial<Record<WorkspaceCardKind, { x: number; y: number }>>,
) => {
  if (typeof window === "undefined") return;
  const payload: StoredWorkspaceCardLastPositionsPayload = {};
  for (const [key, position] of Object.entries(positions)) {
    if (!position || !isWorkspaceCardKind(key)) continue;
    payload[key] = {
      x: toFiniteNumber(position.x, 0),
      y: toFiniteNumber(position.y, 0),
    };
  }
  window.localStorage.setItem(
    WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY,
    JSON.stringify(payload),
  );
};

export const readWorkspacePreviewExpandState = (): {
  expandedNodeId: string | null;
  snapshots: Record<string, PreviewViewportExpandSnapshot>;
} => {
  if (typeof window === "undefined") {
    return { expandedNodeId: null, snapshots: {} };
  }
  const raw = window.localStorage.getItem(
    WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY,
  );
  if (!raw) {
    return { expandedNodeId: null, snapshots: {} };
  }

  try {
    const parsed = JSON.parse(raw) as StoredWorkspacePreviewExpandStatePayload;
    if (!parsed || typeof parsed !== "object") {
      return { expandedNodeId: null, snapshots: {} };
    }

    const expandedNodeId =
      typeof parsed.expandedNodeId === "string" && parsed.expandedNodeId
        ? parsed.expandedNodeId
        : null;
    return { expandedNodeId, snapshots: {} };
  } catch {
    return { expandedNodeId: null, snapshots: {} };
  }
};

export const writeWorkspacePreviewExpandState = (
  expandedNodeId: string | null,
  _snapshots: Record<string, PreviewViewportExpandSnapshot>,
) => {
  if (typeof window === "undefined") return;
  const payload: StoredWorkspacePreviewExpandStatePayload = {
    expandedNodeId: expandedNodeId || null,
  };
  window.localStorage.setItem(
    WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY,
    JSON.stringify(payload),
  );
};

export const readWorkspaceFlow = (): {
  nodes: WorkspaceCardNode[];
  viewport: Viewport | null;
} | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WORKSPACE_FLOW_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWorkspaceFlowPayload;
    if (!parsed || typeof parsed !== "object") return null;
    const parsedNodes = Array.isArray(parsed.nodes)
      ? parsed.nodes
          .map((node) => {
            if (!node || typeof node !== "object") return null;
            const normalizedKind = normalizeWorkspaceCardKind(node.kind);
            if (!normalizedKind) return null;
            return createWorkspaceNode(
              normalizedKind,
              { x: node.x, y: node.y },
              {
                id: typeof node.id === "string" ? node.id : undefined,
                width: node.width,
                height: node.height,
                zIndex: node.zIndex,
              },
            );
          })
          .filter((node): node is WorkspaceCardNode => Boolean(node))
      : [];

    if (!parsedNodes.length) return null;

    const viewport = readStoredWorkspaceViewport(parsed.viewport);
    return { nodes: parsedNodes, viewport };
  } catch {
    return null;
  }
};

export const writeWorkspaceFlow = (
  nodes: WorkspaceCardNode[],
  viewport: Viewport | null,
  expandedNodeId: string | null = null,
  snapshots: Record<string, PreviewViewportExpandSnapshot> = {},
) => {
  if (typeof window === "undefined") return;
  const payload: StoredWorkspaceFlowPayload = {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      x:
        expandedNodeId && node.id === expandedNodeId && snapshots[node.id]
          ? snapshots[node.id].position.x
          : node.position.x,
      y:
        expandedNodeId && node.id === expandedNodeId && snapshots[node.id]
          ? snapshots[node.id].position.y
          : node.position.y,
      width:
        expandedNodeId && node.id === expandedNodeId && snapshots[node.id]
          ? snapshots[node.id].width
          : toFiniteNumber(
              node.width,
              toFiniteNumber(
                node.measured?.width,
                toFiniteNumber(
                  (node.style as Record<string, unknown> | undefined)?.width,
                  resolveWorkspaceCardSize(node.data.kind).width,
                ),
              ),
            ),
      height:
        expandedNodeId && node.id === expandedNodeId && snapshots[node.id]
          ? snapshots[node.id].height
          : toFiniteNumber(
              node.height,
              toFiniteNumber(
                node.measured?.height,
                toFiniteNumber(
                  (node.style as Record<string, unknown> | undefined)?.height,
                  resolveWorkspaceCardSize(node.data.kind).height,
                ),
              ),
            ),
      zIndex:
        expandedNodeId && node.id === expandedNodeId && snapshots[node.id]
          ? Number.isFinite(
              toFiniteNumber(snapshots[node.id].zIndex, Number.NaN),
            )
            ? toFiniteNumber(snapshots[node.id].zIndex, Number.NaN)
            : undefined
          : Number.isFinite(toFiniteNumber(node.zIndex, Number.NaN))
            ? toFiniteNumber(node.zIndex, Number.NaN)
            : undefined,
    })),
  };
  if (viewport) {
    payload.viewport = normalizeWorkspaceViewport(viewport);
  }
  window.localStorage.setItem(
    WORKSPACE_FLOW_STORAGE_KEY,
    JSON.stringify(payload),
  );
};
