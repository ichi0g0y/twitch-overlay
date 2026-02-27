import "@xyflow/react/dist/style.css";
import React, { useCallback, useRef } from "react";
import { PRIMARY_CHAT_TAB_ID, normalizeTwitchChannelName } from "../../utils/chatChannels";
import { MicCaptionSender } from "../mic/MicCaptionSender";
import { SETTINGS_UI_FONT_FAMILY } from "./workspace-card/constants";
import { WORKSPACE_RENDER_CONTEXT } from "./workspace-card/context";
import { WorkspaceFlowCanvas } from "./workspace-card/WorkspaceFlowCanvas";
import { WorkspaceQuickControls } from "./workspace-card/WorkspaceQuickControls";
import { WorkspaceSidePanels } from "./workspace-card/WorkspaceSidePanels";
import { useCollapseExpandedPreviewViewport } from "./workspace-card/useCollapseExpandedPreviewViewport";
import { useWorkspaceCanvasProps } from "./workspace-card/useWorkspaceCanvasProps";
import { useWorkspaceCardActions } from "./workspace-card/useWorkspaceCardActions";
import { useWorkspaceDataEffects } from "./workspace-card/useWorkspaceDataEffects";
import { useWorkspaceEffects } from "./workspace-card/useWorkspaceEffects";
import { useWorkspaceFlowHandlers } from "./workspace-card/useWorkspaceFlowHandlers";
import { useWorkspaceNodeClick } from "./workspace-card/useWorkspaceNodeClick";
import { useWorkspacePersistenceEffects } from "./workspace-card/useWorkspacePersistenceEffects";
import { useWorkspacePreviewActions } from "./workspace-card/useWorkspacePreviewActions";
import { useWorkspacePreviewEffects } from "./workspace-card/useWorkspacePreviewEffects";
import { useWorkspaceRenderContext } from "./workspace-card/useWorkspaceRenderContext";
import { useWorkspaceRuntimeState } from "./workspace-card/useWorkspaceRuntimeState";
import { useWorkspaceSidePanelProps } from "./workspace-card/useWorkspaceSidePanelProps";
export const SettingsPageWorkspace: React.FC = () => {
  const autoVerifyTriggeredRef = useRef(false);
  const runtime = useWorkspaceRuntimeState();
  const {
    settings,
    state,
    nodes,
    setNodes,
    onNodesChange,
    workspaceShellRef,
    quickControlsHideTimerRef,
    shouldFitWorkspaceOnInitRef,
    workspaceFlowInstanceRef,
    lastWorkspaceCardPositionRef,
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    restoredInitialExpandedPreviewRef,
  } = runtime;

  const collapseExpandedPreviewViewport = useCollapseExpandedPreviewViewport({
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    setNodes,
    setExpandedPreviewNodeId: state.setExpandedPreviewNodeId,
  });
  const previewActions = useWorkspacePreviewActions({
    nodes,
    setNodes,
    workspaceSnapEnabled: state.workspaceSnapEnabled,
    expandedPreviewNodeId: state.expandedPreviewNodeId,
    setExpandedPreviewNodeId: state.setExpandedPreviewNodeId,
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    workspaceFlowInstanceRef,
    scrollModeEnabled: settings.scrollModeEnabled,
    previewInteractionKind: state.previewInteractionKind,
    setPreviewInteractionKind: state.setPreviewInteractionKind,
    setPreviewReloadNonceByKind: state.setPreviewReloadNonceByKind,
    setPreviewWarningByKind: state.setPreviewWarningByKind,
  });

  const flowHandlers = useWorkspaceFlowHandlers({
    setWorkspaceViewport: state.setWorkspaceViewport,
    collapseExpandedPreviewViewport,
    scrollModeEnabled: settings.scrollModeEnabled,
    deactivatePreviewInteraction: previewActions.deactivatePreviewInteraction,
    quickControlsHideTimerRef,
    setIsWorkspaceControlsVisible: state.setIsWorkspaceControlsVisible,
    workspaceFlowInstanceRef,
    setIsWorkspaceFlowReady: state.setIsWorkspaceFlowReady,
    shouldFitWorkspaceOnInitRef,
  });

  useWorkspaceEffects({
    quickControlsHideTimerRef,
    scrollModeEnabled: settings.scrollModeEnabled,
    deactivatePreviewInteraction: previewActions.deactivatePreviewInteraction,
    previewInteractionKind: state.previewInteractionKind,
    nodes,
    workspaceShellRef,
    collapseExpandedPreviewViewport,
    panActivationKeyCode: settings.panActivationKeyCode,
    zoomActivationKeyCode: settings.zoomActivationKeyCode,
    setIsPanKeyActive: state.setIsPanKeyActive,
    setIsZoomActivationKeyActive: state.setIsZoomActivationKeyActive,
  });

  useWorkspaceDataEffects({
    featureStatus: settings.featureStatus,
    authStatus: settings.authStatus,
    twitchUserInfo: settings.twitchUserInfo,
    verifyingTwitch: settings.verifyingTwitch,
    verifyTwitchConfig: settings.verifyTwitchConfig,
    autoVerifyTriggeredRef,
    followedRailSide: state.followedRailSide,
    followedRailSelfViewerCountVisible: state.followedRailSelfViewerCountVisible,
    workspaceSnapEnabled: state.workspaceSnapEnabled,
    setFollowedChannels: state.setFollowedChannels,
    setFollowedChannelsError: state.setFollowedChannelsError,
    setFollowedChannelsLoading: state.setFollowedChannelsLoading,
    setNodes,
    lastWorkspaceCardPositionRef,
  });

  const cardActions = useWorkspaceCardActions({
    nodes,
    setNodes,
    streamIsLive: Boolean(settings.streamStatus?.is_live),
    workspaceFlowInstanceRef,
    lastWorkspaceCardPositionRef,
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    setExpandedPreviewNodeId: state.setExpandedPreviewNodeId,
    setChatSidebarActiveTabRequest: state.setChatSidebarActiveTabRequest,
    setPendingPreviewRevealKind: state.setPendingPreviewRevealKind,
  });

  useWorkspacePreviewEffects({
    isWorkspaceFlowReady: state.isWorkspaceFlowReady,
    nodes,
    setNodes,
    restoredInitialExpandedPreviewRef,
    expandedPreviewNodeIdRef,
    setExpandedPreviewNodeId: state.setExpandedPreviewNodeId,
    togglePreviewViewportExpand: previewActions.togglePreviewViewportExpand,
    bringPreviewNodeToFront: previewActions.bringPreviewNodeToFront,
    pendingPreviewRevealKind: state.pendingPreviewRevealKind,
    workspaceFlowInstanceRef,
    workspaceShellRef,
    activatePreviewInteraction: previewActions.activatePreviewInteraction,
    setPendingPreviewRevealKind: state.setPendingPreviewRevealKind,
  });

  useWorkspacePersistenceEffects({
    nodes,
    workspaceViewport: state.workspaceViewport,
    expandedPreviewNodeId: state.expandedPreviewNodeId,
    expandedPreviewNodeIdRef,
    previewExpandSnapshotRef,
    setExpandedPreviewNodeId: state.setExpandedPreviewNodeId,
  });

  const workspaceRenderContext = useWorkspaceRenderContext({
    featureStatus: settings.featureStatus,
    authStatus: settings.authStatus,
    twitchUserInfo: settings.twitchUserInfo,
    previewPortalEnabled: settings.previewPortalEnabled,
    isPreviewInteractionEnabled: previewActions.isPreviewInteractionEnabled,
    setPreviewWarning: previewActions.setPreviewWarning,
    getSettingValue: settings.getSettingValue,
    handleSettingChange: settings.handleSettingChange,
    getBooleanValue: settings.getBooleanValue,
    streamStatus: settings.streamStatus,
    fileInputRef: settings.fileInputRef,
    uploadingFont: settings.uploadingFont,
    handleFontUpload: settings.handleFontUpload,
    previewText: settings.previewText,
    setPreviewText: settings.setPreviewText,
    previewImage: settings.previewImage,
    handleFontPreview: settings.handleFontPreview,
    handleDeleteFont: settings.handleDeleteFont,
    handleTestNotification: settings.handleTestNotification,
    testingNotification: settings.testingNotification,
    contextValue: settings.contextValue,
    previewReloadNonceByKind: state.previewReloadNonceByKind,
    activeChatSidebarTabId: state.activeChatSidebarTabId,
    followedChannels: state.followedChannels,
    previewWarningByKind: state.previewWarningByKind,
    removeWorkspaceCard: cardActions.removeWorkspaceCard,
    refreshPreview: previewActions.refreshPreview,
    togglePreviewViewportExpand: previewActions.togglePreviewViewportExpand,
    isPreviewViewportExpanded: previewActions.isPreviewViewportExpanded,
    togglePreviewInteraction: previewActions.togglePreviewInteraction,
    snapWorkspaceCardSize: previewActions.snapWorkspaceCardSize,
  });

  const handleWorkspaceNodeClick = useWorkspaceNodeClick({
    activatePreviewInteraction: previewActions.activatePreviewInteraction,
    bringPreviewNodeToFront: previewActions.bringPreviewNodeToFront,
    setChatSidebarActiveTabRequest: state.setChatSidebarActiveTabRequest,
  });

  const hasPreviewForTab = useCallback(
    (tabId: string) => {
      const requestedTabId = (tabId || "").trim();
      if (!requestedTabId) return false;
      if (requestedTabId === PRIMARY_CHAT_TAB_ID) {
        return nodes.some((node) => node.data.kind === "preview-main");
      }
      const normalized = normalizeTwitchChannelName(requestedTabId);
      if (!normalized) return false;
      return nodes.some(
        (node) => node.data.kind === `preview-irc:${normalized}`,
      );
    },
    [nodes],
  );

  const { sidePanelProps, topBarOffsets } = useWorkspaceSidePanelProps({
    followedRailSide: state.followedRailSide,
    followedRailSelfViewerCountVisible: state.followedRailSelfViewerCountVisible,
    followedChannels: state.followedChannels,
    followedChannelsLoading: state.followedChannelsLoading,
    followedChannelsError: state.followedChannelsError,
    streamIsLive: Boolean(settings.streamStatus?.is_live),
    chatSidebarWidth: state.chatSidebarWidth,
    setChatSidebarWidth: state.setChatSidebarWidth,
    chatSidebarFontSize: state.chatSidebarFontSize,
    setChatSidebarFontSize: state.setChatSidebarFontSize,
    setFollowedRailSide: state.setFollowedRailSide,
    setFollowedRailSelfViewerCountVisible:
      state.setFollowedRailSelfViewerCountVisible,
    handleOpenOverlay: settings.handleOpenOverlay,
    handleOpenOverlayDebug: settings.handleOpenOverlayDebug,
    handleOpenPresent: settings.handleOpenPresent,
    handleOpenPresentDebug: settings.handleOpenPresentDebug,
    addIrcPreviewCard: cardActions.addIrcPreviewCard,
    handleStartRaidToChannel: cardActions.handleStartRaidToChannel,
    handleStartShoutoutToChannel: cardActions.handleStartShoutoutToChannel,
    chatSidebarActiveTabRequest: state.chatSidebarActiveTabRequest,
    setActiveChatSidebarTabId: state.setActiveChatSidebarTabId,
    hasPreviewForTab,
    getSettingValue: settings.getSettingValue,
    handleSettingChange: settings.handleSettingChange,
    featureStatus: settings.featureStatus,
    authStatus: settings.authStatus,
    streamStatus: settings.streamStatus,
    twitchUserInfo: settings.twitchUserInfo,
    printerStatusInfo: settings.printerStatusInfo,
    webServerPort: settings.webServerPort,
    refreshingStreamStatus: settings.refreshingStreamStatus,
    reconnectingPrinter: settings.reconnectingPrinter,
    testingPrinter: settings.testingPrinter,
    verifyingTwitch: settings.verifyingTwitch,
    handleTwitchAuth: settings.handleTwitchAuth,
    handleRefreshStreamStatus: settings.handleRefreshStreamStatus,
    verifyTwitchConfig: settings.verifyTwitchConfig,
    handlePrinterReconnect: settings.handlePrinterReconnect,
    handleTestPrint: settings.handleTestPrint,
    overlaySettings: settings.overlaySettings ?? null,
    updateOverlaySettings: settings.updateOverlaySettings,
    addWorkspaceCard: cardActions.addWorkspaceCard,
    canAddCard: cardActions.canAddCard,
  });

  const shouldShowQuickControls =
    state.isWorkspaceControlsVisible ||
    state.panningSettingsOpen ||
    state.isQuickControlsHovered;
  const { flowCanvasProps, quickControlsProps } = useWorkspaceCanvasProps({
    workspaceShellRef,
    topBarOffsets,
    handleWorkspaceMouseMove: flowHandlers.handleWorkspaceMouseMove,
    handleWorkspaceMouseLeave: flowHandlers.handleWorkspaceMouseLeave,
    nodes,
    onNodesChange,
    handleWorkspaceNodeClick,
    handleWorkspaceMoveStart: flowHandlers.handleWorkspaceMoveStart,
    handleWorkspaceMoveEnd: flowHandlers.handleWorkspaceMoveEnd,
    handleWorkspaceFlowInit: flowHandlers.handleWorkspaceFlowInit,
    workspaceSnapEnabled: state.workspaceSnapEnabled,
    scrollModeEnabled: settings.scrollModeEnabled,
    panActivationKeyCode: settings.panActivationKeyCode,
    isPanKeyActive: state.isPanKeyActive,
    isZoomActivationKeyActive: state.isZoomActivationKeyActive,
    isWorkspaceControlsVisible: state.isWorkspaceControlsVisible,
    panningSettingsOpen: state.panningSettingsOpen,
    workspaceViewport: state.workspaceViewport,
    shouldShowQuickControls,
    quickControlsHideTimerRef,
    setPanningSettingsOpen: state.setPanningSettingsOpen,
    setIsQuickControlsHovered: state.setIsQuickControlsHovered,
    setIsWorkspaceControlsVisible: state.setIsWorkspaceControlsVisible,
    collapseExpandedPreviewViewport,
    workspaceFlowInstanceRef,
    setWorkspaceSnapEnabled: state.setWorkspaceSnapEnabled,
    handleSettingChange: settings.handleSettingChange,
    zoomActivationKeyCode: settings.zoomActivationKeyCode,
    previewPortalEnabled: settings.previewPortalEnabled,
  });

  return (
    <div
      className="min-h-screen bg-gray-900 transition-colors"
      style={{ fontFamily: SETTINGS_UI_FONT_FAMILY }}
    >
      <div className="hidden" aria-hidden="true">
        <MicCaptionSender
          variant="switch_only"
          overlaySettings={settings.overlaySettings ?? null}
          webServerPort={settings.webServerPort}
        />
      </div>
      <WORKSPACE_RENDER_CONTEXT.Provider value={workspaceRenderContext}>
        <WorkspaceFlowCanvas {...flowCanvasProps} />
        <WorkspaceQuickControls {...quickControlsProps} />
        <WorkspaceSidePanels {...sidePanelProps} />
      </WORKSPACE_RENDER_CONTEXT.Provider>
    </div>
  );
};
