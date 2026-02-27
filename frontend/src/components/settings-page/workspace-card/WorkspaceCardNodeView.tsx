import { NodeResizer, type NodeProps, type NodeTypes } from "@xyflow/react";
import { ExternalLink, Maximize2, Minimize2, Mouse, RefreshCw, X } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { WorkspaceCardUiContext } from "../../ui/collapsible-card";
import { PREVIEW_NODE_MIN_Z_INDEX, PREVIEW_PORTAL_BASE_Z_INDEX, PREVIEW_PORTAL_EXPANDED_Z_INDEX } from "./constants";
import { WORKSPACE_RENDER_CONTEXT } from "./context";
import { usePreviewPortalRect, useWarningTooltip } from "./hooks";
import { PreviewCloseConfirmDialog } from "./PreviewCloseConfirmDialog";
import { WorkspaceCardPortals } from "./WorkspaceCardPortals";
import type { WorkspaceCardNode } from "./types";

const toFiniteNumber = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const WorkspaceCardNodeView: React.FC<NodeProps<WorkspaceCardNode>> = ({
  id,
  data,
  selected,
  dragging,
  zIndex,
}) => {
  const renderContext = useContext(WORKSPACE_RENDER_CONTEXT);
  if (!renderContext) return null;

  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPreviewCloseDialogOpen, setIsPreviewCloseDialogOpen] = useState(false);
  const previewContentHostRef = useRef<HTMLDivElement | null>(null);
  const { warningTooltip, hideWarningTooltip, showWarningTooltip } =
    useWarningTooltip();

  const cardAsNode = renderContext.isCollapsibleCardNodeKind(data.kind);
  const previewHeader = cardAsNode ? null : renderContext.resolvePreviewHeader(data.kind);
  const minSize = renderContext.resolveCardMinSize(data.kind);
  const showResizeHandles = selected || isHovered || isResizing;
  const isNodeInteractionLocked = isResizing || Boolean(dragging);
  const nodeInteractionClassName = isResizing ? "pointer-events-none select-none" : "";
  const isPreviewViewportExpanded = renderContext.isPreviewViewportExpanded(id);
  const previewPortalZIndex = isPreviewViewportExpanded ? PREVIEW_PORTAL_EXPANDED_Z_INDEX : PREVIEW_PORTAL_BASE_Z_INDEX + toFiniteNumber(zIndex, PREVIEW_NODE_MIN_Z_INDEX);
  const previewInteractionEnabled = previewHeader ? renderContext.isPreviewInteractionEnabled(data.kind) : true;
  const isPreviewPointerInputBlocked =
    isNodeInteractionLocked || !previewInteractionEnabled;
  const previewHeaderClassName = previewHeader?.isLinkedChatTab
    ? "border-b border-sky-400/60 bg-sky-500/20"
    : "border-b border-gray-800/80 bg-gray-900/85";
  const isPreviewModalLikeExpanded =
    Boolean(previewHeader) && isPreviewViewportExpanded;
  const shouldPortalPreviewContent =
    Boolean(previewHeader) &&
    renderContext.previewPortalEnabled &&
    typeof document !== "undefined";
  const previewContentNode = cardAsNode ? null : renderContext.renderCard(data.kind);
  const previewPortalRect = usePreviewPortalRect(
    shouldPortalPreviewContent,
    previewContentHostRef,
  );
  const previewChannelLogin = data.kind.startsWith("preview-irc:")
    ? data.kind.slice("preview-irc:".length).trim().toLowerCase()
    : "";
  const handlePreviewHeaderPointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!previewHeader) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".nodrag")) return;
    window.dispatchEvent(
      new CustomEvent("workspace-preview-bring-to-front", {
        detail: { nodeId: id },
      }),
    );
  };
  const handleRemoveCardByCloseButton = () => {
    if (!previewChannelLogin) {
      renderContext.removeCard(id);
      return;
    }
    setIsPreviewCloseDialogOpen(true);
  };

  return (
    <div
      className="relative h-full min-h-0 min-w-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer
        minWidth={minSize.minWidth}
        minHeight={minSize.minHeight}
        isVisible={showResizeHandles && !isPreviewModalLikeExpanded}
        lineClassName="!border-transparent"
        handleClassName="!h-3.5 !w-3.5 !rounded-sm !border-none !bg-transparent !opacity-0"
        onResizeStart={() => {
          setIsResizing(true);
        }}
        onResizeEnd={(_event, params) => {
          setIsResizing(false);
          renderContext.snapCardSize(id, params.width, params.height);
        }}
      />
      {cardAsNode ? (
        <div
          className={`settings-node-card-shell h-full min-h-0 ${nodeInteractionClassName}`}
        >
          <WorkspaceCardUiContext.Provider
            value={{
              onClose: () => renderContext.removeCard(id),
              nodeMode: true,
            }}
          >
            {renderContext.renderCard(data.kind)}
          </WorkspaceCardUiContext.Provider>
        </div>
      ) : (
        <div
          className={`h-full min-h-0 overflow-hidden rounded-md border border-gray-800/80 bg-gray-950/20 ${nodeInteractionClassName}`}
        >
          {!isPreviewModalLikeExpanded && (
            <div
              className={`workspace-node-drag-handle flex h-9 items-center px-3 ${previewHeaderClassName}`}
              onPointerDownCapture={handlePreviewHeaderPointerDownCapture}
              data-workspace-node-drag-handle="true"
            >
              {previewHeader ? (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-gray-200">
                      {previewHeader.channelDisplayName}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] ${previewHeader.statusClassName}`}
                    >
                      {previewHeader.statusLabel}
                    </span>
                    {previewHeader.streamTitle && (
                      <span
                        className="truncate text-[11px] text-gray-300"
                        title={previewHeader.streamTitle}
                      >
                        {previewHeader.streamTitle}
                      </span>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        renderContext.togglePreviewInteraction(data.kind);
                      }}
                      className={`nodrag inline-flex h-6 w-6 items-center justify-center rounded border ${
                        previewInteractionEnabled
                          ? "border-sky-500/50 bg-sky-500/20 text-sky-300 hover:bg-sky-500/25"
                          : "border-gray-700 bg-gray-900/80 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                      }`}
                      title={
                        previewInteractionEnabled
                          ? "プレビュー操作をロックする"
                          : "プレビュー操作を有効化する"
                      }
                      aria-label={
                        previewInteractionEnabled
                          ? "プレビュー操作をロックする"
                          : "プレビュー操作を有効化する"
                      }
                    >
                      <Mouse className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => renderContext.refreshPreview(data.kind)}
                      className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                      aria-label="プレビューを更新"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => renderContext.togglePreviewViewportExpand(id)}
                      className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                      aria-label={
                        isPreviewViewportExpanded
                          ? "プレビュー拡大を解除"
                          : "プレビューを一時拡大"
                      }
                      title={
                        isPreviewViewportExpanded ? "拡大解除" : "一時拡大"
                      }
                    >
                      {isPreviewViewportExpanded ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {previewHeader.channelLogin && (
                      <a
                        href={`https://www.twitch.tv/${encodeURIComponent(previewHeader.channelLogin)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                        aria-label={`${previewHeader.channelLogin} を開く`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {previewHeader.warningMessage && (
                      <button
                        type="button"
                        className="nodrag inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-semibold text-amber-300"
                        aria-label={`プレビュー警告: ${previewHeader.warningMessage}`}
                        onMouseEnter={(event) =>
                          showWarningTooltip(
                            event.currentTarget,
                            previewHeader.warningMessage as string,
                          )
                        }
                        onMouseLeave={hideWarningTooltip}
                        onFocus={(event) =>
                          showWarningTooltip(
                            event.currentTarget,
                            previewHeader.warningMessage as string,
                          )
                        }
                        onBlur={hideWarningTooltip}
                      >
                        !
                      </button>
                    )}
                    <button
                      type="button"
                      className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                      onClick={handleRemoveCardByCloseButton}
                      aria-label="カードを削除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <span className="truncate text-xs font-semibold text-gray-200">
                  {data.title}
                </span>
              )}
              {!previewHeader && (
                <button
                  type="button"
                  className="nodrag ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                  onClick={handleRemoveCardByCloseButton}
                  aria-label="カードを削除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div
            ref={previewContentHostRef}
            className={`nodrag nowheel ${isPreviewModalLikeExpanded ? "h-full" : "h-[calc(100%-2.25rem)]"} overflow-auto ${isPreviewPointerInputBlocked ? "pointer-events-none select-none" : ""}`}
          >
            {shouldPortalPreviewContent ? (
              <div className="h-full w-full" />
            ) : (
              previewContentNode
            )}
          </div>
        </div>
      )}
      <WorkspaceCardPortals
        isPreviewModalLikeExpanded={isPreviewModalLikeExpanded}
        shouldPortalPreviewContent={shouldPortalPreviewContent}
        previewPortalRect={previewPortalRect}
        isPreviewPointerInputBlocked={isPreviewPointerInputBlocked}
        previewPortalZIndex={previewPortalZIndex}
        previewContentNode={previewContentNode}
        warningTooltip={warningTooltip}
        onExpandedBackdropDismiss={() => renderContext.togglePreviewViewportExpand(id)}
      />
      <PreviewCloseConfirmDialog
        isOpen={isPreviewCloseDialogOpen}
        channelLogin={previewChannelLogin}
        channelDisplayName={previewHeader?.channelDisplayName || previewChannelLogin}
        onClose={() => setIsPreviewCloseDialogOpen(false)}
        onClosePreviewOnly={() => {
          setIsPreviewCloseDialogOpen(false);
          renderContext.removeCard(id, { disconnectIrcChannel: false });
        }}
        onCloseWithComment={() => {
          setIsPreviewCloseDialogOpen(false);
          renderContext.removeCard(id, { disconnectIrcChannel: true });
        }}
      />
    </div>
  );
};

export const WORKSPACE_NODE_TYPES: NodeTypes = {
  "workspace-card": WorkspaceCardNodeView,
};
