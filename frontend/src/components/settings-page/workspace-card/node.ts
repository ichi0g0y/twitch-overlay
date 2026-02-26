import {
  PREVIEW_NODE_EXPANDED_Z_INDEX,
  PREVIEW_NODE_MAX_Z_INDEX,
  PREVIEW_NODE_MIN_Z_INDEX,
  WORKSPACE_CARD_SPAWN_MARGIN,
  WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT,
  WORKSPACE_CARD_SPAWN_SEARCH_STEP,
  WORKSPACE_SNAP_GRID,
} from "./constants";
import { isPreviewCardKind, isPreviewIrcKind, resolveWorkspaceCardTitle } from "./kinds";
import { toFiniteNumber } from "./numeric";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

const snapWorkspaceSizeToGrid = (size: { width: number; height: number }) => ({
  width: Math.max(
    WORKSPACE_SNAP_GRID[0],
    Math.round(size.width / WORKSPACE_SNAP_GRID[0]) * WORKSPACE_SNAP_GRID[0],
  ),
  height: Math.max(
    WORKSPACE_SNAP_GRID[1],
    Math.round(size.height / WORKSPACE_SNAP_GRID[1]) * WORKSPACE_SNAP_GRID[1],
  ),
});

export const resolveWorkspaceCardSize = (kind: WorkspaceCardKind) => {
  if (kind === "preview-main" || isPreviewIrcKind(kind)) {
    return snapWorkspaceSizeToGrid({ width: 620, height: 360 });
  }
  if (kind === "logs") {
    return snapWorkspaceSizeToGrid({ width: 640, height: 420 });
  }
  if (
    kind === "overlay-music-player" ||
    kind === "overlay-fax" ||
    kind === "overlay-clock" ||
    kind === "overlay-mic-transcript" ||
    kind === "overlay-reward-count" ||
    kind === "overlay-lottery"
  ) {
    return snapWorkspaceSizeToGrid({ width: 520, height: 460 });
  }
  return snapWorkspaceSizeToGrid({ width: 500, height: 400 });
};

const resolveWorkspaceNodeSize = (node: WorkspaceCardNode) => {
  const fallback = resolveWorkspaceCardSize(node.data.kind);
  const width = toFiniteNumber(
    node.width,
    toFiniteNumber(
      node.measured?.width,
      toFiniteNumber(
        (node.style as Record<string, unknown> | undefined)?.width,
        fallback.width,
      ),
    ),
  );
  const height = toFiniteNumber(
    node.height,
    toFiniteNumber(
      node.measured?.height,
      toFiniteNumber(
        (node.style as Record<string, unknown> | undefined)?.height,
        fallback.height,
      ),
    ),
  );
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
};

export const findAvailableWorkspaceCardPosition = (
  kind: WorkspaceCardKind,
  base: { x: number; y: number },
  existingNodes: WorkspaceCardNode[],
  options: {
    size?: { width: number; height: number };
  } = {},
) => {
  const size = options.size ?? resolveWorkspaceCardSize(kind);
  const maxAttempts =
    WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT *
    WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT *
    8;
  const collides = (candidate: { x: number; y: number }) => {
    const left = candidate.x;
    const top = candidate.y;
    const right = left + size.width;
    const bottom = top + size.height;
    return existingNodes.some((node) => {
      const nodeSize = resolveWorkspaceNodeSize(node);
      const nodeLeft = node.position.x;
      const nodeTop = node.position.y;
      const nodeRight = nodeLeft + nodeSize.width;
      const nodeBottom = nodeTop + nodeSize.height;
      return !(
        right + WORKSPACE_CARD_SPAWN_MARGIN <= nodeLeft ||
        left >= nodeRight + WORKSPACE_CARD_SPAWN_MARGIN ||
        bottom + WORKSPACE_CARD_SPAWN_MARGIN <= nodeTop ||
        top >= nodeBottom + WORKSPACE_CARD_SPAWN_MARGIN
      );
    });
  };

  if (!collides(base)) return base;

  let attempts = 0;
  for (let ring = 1; ring <= WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT; ring++) {
    const offset = ring * WORKSPACE_CARD_SPAWN_SEARCH_STEP;
    const ringPoints: Array<{ x: number; y: number }> = [];
    for (let dx = -ring; dx <= ring; dx++) {
      ringPoints.push({
        x: base.x + dx * WORKSPACE_CARD_SPAWN_SEARCH_STEP,
        y: base.y - offset,
      });
      ringPoints.push({
        x: base.x + dx * WORKSPACE_CARD_SPAWN_SEARCH_STEP,
        y: base.y + offset,
      });
    }
    for (let dy = -ring + 1; dy <= ring - 1; dy++) {
      ringPoints.push({
        x: base.x - offset,
        y: base.y + dy * WORKSPACE_CARD_SPAWN_SEARCH_STEP,
      });
      ringPoints.push({
        x: base.x + offset,
        y: base.y + dy * WORKSPACE_CARD_SPAWN_SEARCH_STEP,
      });
    }

    for (const candidate of ringPoints) {
      attempts += 1;
      if (!collides(candidate)) {
        return candidate;
      }
      if (attempts >= maxAttempts) {
        return candidate;
      }
    }
  }

  return {
    x: base.x + WORKSPACE_CARD_SPAWN_SEARCH_STEP,
    y: base.y + WORKSPACE_CARD_SPAWN_SEARCH_STEP,
  };
};

export const reorderPreviewNodesForFront = (
  nodes: WorkspaceCardNode[],
  frontNodeId: string,
  expandedPreviewNodeId: string | null,
) => {
  const frontNode = nodes.find((node) => node.id === frontNodeId);
  if (!frontNode || !isPreviewCardKind(frontNode.data.kind)) return nodes;

  const expandedNode = expandedPreviewNodeId
    ? nodes.find((node) => node.id === expandedPreviewNodeId)
    : null;

  if (expandedPreviewNodeId === frontNodeId && expandedNode) {
    if (expandedNode.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX) return nodes;
    return nodes.map((node) =>
      node.id === frontNodeId
        ? { ...node, zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX }
        : node,
    );
  }

  const previewNodes = nodes.filter((node) =>
    isPreviewCardKind(node.data.kind),
  );
  if (previewNodes.length <= 1) return nodes;

  const sortedPreviewNodes = [...previewNodes].sort((a, b) => {
    const aZ = toFiniteNumber(a.zIndex, PREVIEW_NODE_MIN_Z_INDEX);
    const bZ = toFiniteNumber(b.zIndex, PREVIEW_NODE_MIN_Z_INDEX);
    if (aZ === bZ) {
      return a.id.localeCompare(b.id);
    }
    return aZ - bZ;
  });

  const availableSlots =
    PREVIEW_NODE_MAX_Z_INDEX - PREVIEW_NODE_MIN_Z_INDEX;
  const basePreviewNodes = sortedPreviewNodes.filter(
    (node) => node.id !== frontNodeId && node.id !== expandedPreviewNodeId,
  );
  const offset = Math.max(0, basePreviewNodes.length - availableSlots);
  const nextZIndexById = new Map<string, number>();

  basePreviewNodes.slice(offset).forEach((node, index) => {
    nextZIndexById.set(node.id, PREVIEW_NODE_MIN_Z_INDEX + index);
  });
  nextZIndexById.set(frontNodeId, PREVIEW_NODE_MAX_Z_INDEX);

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === expandedPreviewNodeId) {
      if (node.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX) return node;
      changed = true;
      return { ...node, zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX };
    }
    const nextZIndex = nextZIndexById.get(node.id);
    if (nextZIndex == null || node.zIndex === nextZIndex) return node;
    changed = true;
    return { ...node, zIndex: nextZIndex };
  });
  return changed ? nextNodes : nodes;
};

export const resolveWorkspaceCardMinSize = (kind: WorkspaceCardKind) => {
  if (isPreviewCardKind(kind)) {
    // Twitch iframe autoplay requires at least 400x300; node header consumes 36px height.
    return { minWidth: 400, minHeight: 336 };
  }
  return { minWidth: 320, minHeight: 220 };
};

export const isCollapsibleCardNodeKind = (kind: WorkspaceCardKind) => {
  if (isPreviewCardKind(kind)) return false;
  if (kind === "logs") return false;
  return true;
};

const createWorkspaceNodeId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createWorkspaceNode = (
  kind: WorkspaceCardKind,
  position: { x: number; y: number },
  options: {
    id?: string;
    width?: number;
    height?: number;
    zIndex?: number;
  } = {},
): WorkspaceCardNode => {
  const defaults = resolveWorkspaceCardSize(kind);
  const mins = resolveWorkspaceCardMinSize(kind);
  const width = Math.max(
    mins.minWidth,
    toFiniteNumber(options.width, defaults.width),
  );
  const height = Math.max(
    mins.minHeight,
    toFiniteNumber(options.height, defaults.height),
  );
  return {
    id: options.id ?? createWorkspaceNodeId(),
    type: "workspace-card",
    position: {
      x: toFiniteNumber(position.x, 0),
      y: toFiniteNumber(position.y, 0),
    },
    dragHandle:
      '.workspace-node-drag-handle,[data-workspace-node-drag-handle="true"]',
    data: {
      kind,
      title: resolveWorkspaceCardTitle(kind),
    },
    width,
    height,
    zIndex: Number.isFinite(toFiniteNumber(options.zIndex, Number.NaN))
      ? toFiniteNumber(options.zIndex, Number.NaN)
      : undefined,
  };
};
