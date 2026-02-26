import { useSettingsPage } from "../../../hooks/useSettingsPage";
import { normalizeWorkspaceZoomActivationKeyCode } from "./numeric";

export const useWorkspaceSettingsBindings = () => {
  const contextValue = useSettingsPage();
  const {
    featureStatus,
    authStatus,
    streamStatus,
    twitchUserInfo,
    printerStatusInfo,
    refreshingStreamStatus,
    reconnectingPrinter,
    testingPrinter,
    testingNotification,
    verifyingTwitch,
    webServerPort,
    uploadingFont,
    previewImage,
    previewText,
    setPreviewText,
    fileInputRef,
    getSettingValue,
    getBooleanValue,
    handleSettingChange,
    handleTwitchAuth,
    handleRefreshStreamStatus,
    verifyTwitchConfig,
    handlePrinterReconnect,
    handleTestPrint,
    handleTestNotification,
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
    handleOpenPresent,
    handleOpenPresentDebug,
    handleOpenOverlay,
    handleOpenOverlayDebug,
    overlaySettings,
    updateOverlaySettings,
  } = contextValue;

  const panActivationKeyCode =
    getSettingValue("WORKSPACE_PAN_ACTIVATION_KEY") || "Space";
  const zoomActivationKeyCode = normalizeWorkspaceZoomActivationKeyCode(
    getSettingValue("WORKSPACE_ZOOM_MODIFIER_KEY") || "Control",
  );
  const scrollModeSettingValue = getSettingValue(
    "WORKSPACE_SCROLL_MODE_ENABLED",
  );
  const scrollModeEnabled =
    (scrollModeSettingValue || getSettingValue("WORKSPACE_PAN_ON_SCROLL")) ===
    "true";
  const previewPortalEnabled =
    getSettingValue("WORKSPACE_PREVIEW_PORTAL_ENABLED") === "true";

  return {
    contextValue,
    featureStatus,
    authStatus,
    streamStatus,
    twitchUserInfo,
    printerStatusInfo,
    refreshingStreamStatus,
    reconnectingPrinter,
    testingPrinter,
    testingNotification,
    verifyingTwitch,
    webServerPort,
    uploadingFont,
    previewImage,
    previewText,
    setPreviewText,
    fileInputRef,
    getSettingValue,
    getBooleanValue,
    handleSettingChange,
    handleTwitchAuth,
    handleRefreshStreamStatus,
    verifyTwitchConfig,
    handlePrinterReconnect,
    handleTestPrint,
    handleTestNotification,
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
    handleOpenPresent,
    handleOpenPresentDebug,
    handleOpenOverlay,
    handleOpenOverlayDebug,
    overlaySettings,
    updateOverlaySettings,
    panActivationKeyCode,
    zoomActivationKeyCode,
    scrollModeEnabled,
    previewPortalEnabled,
  };
};
