import {
  BASE_CARD_KIND_SET,
  BASE_WORKSPACE_MENU,
  LEGACY_WORKSPACE_CARD_KIND_MAP,
} from "./catalog";
import type {
  BaseWorkspaceCardKind,
  LegacyWorkspaceCardKind,
  WorkspaceCardKind,
} from "./types";

export const isPreviewIrcKind = (kind: string): kind is `preview-irc:${string}` =>
  kind.startsWith("preview-irc:") && kind.length > "preview-irc:".length;

export const isPreviewCardKind = (kind: WorkspaceCardKind) =>
  kind === "preview-main" || isPreviewIrcKind(kind);

export const isWorkspaceCardKind = (kind: string): kind is WorkspaceCardKind =>
  BASE_CARD_KIND_SET.has(kind as BaseWorkspaceCardKind) ||
  isPreviewIrcKind(kind);

export const normalizeWorkspaceCardKind = (
  kind: string,
): WorkspaceCardKind | null => {
  if (isWorkspaceCardKind(kind)) return kind;
  if (kind in LEGACY_WORKSPACE_CARD_KIND_MAP) {
    return LEGACY_WORKSPACE_CARD_KIND_MAP[kind as LegacyWorkspaceCardKind];
  }
  return null;
};

export const resolveWorkspaceCardTitle = (kind: WorkspaceCardKind) => {
  if (isPreviewIrcKind(kind)) {
    return `配信プレビュー (${kind.slice("preview-irc:".length)})`;
  }
  const staticItem = BASE_WORKSPACE_MENU.find((item) => item.kind === kind);
  return staticItem?.label ?? kind;
};
