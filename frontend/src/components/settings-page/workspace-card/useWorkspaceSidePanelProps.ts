import { useCallback, useMemo, type ComponentProps, type Dispatch, type SetStateAction } from "react";
import type { OverlaySettings as OverlaySettingsState } from "../../../contexts/SettingsContext";
import type {
  AuthStatus,
  FeatureStatus,
  PrinterStatusInfo,
  StreamStatus,
  TwitchUserInfo,
} from "../../../types";
import { FOLLOWED_RAIL_WIDTH_PX } from "../../settings/FollowedChannelsRail";
import { BASE_WORKSPACE_MENU } from "./catalog";
import {
  SIDEBAR_FONT_SIZE_STORAGE_KEY,
  SIDEBAR_MAX_FONT_SIZE,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_FONT_SIZE,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "./constants";
import { WorkspaceSidePanels } from "./WorkspaceSidePanels";
import type { WorkspaceCardMenuItem } from "./types";
import { useWorkspaceStatusTopBarProps } from "./useWorkspaceStatusTopBarProps";

type WorkspaceSidePanelsProps = ComponentProps<typeof WorkspaceSidePanels>;
type RailProps = WorkspaceSidePanelsProps["railProps"];
type ChatSidebarProps = WorkspaceSidePanelsProps["chatSidebarProps"];
type StatusTopBarProps = WorkspaceSidePanelsProps["statusTopBarProps"];

type UseWorkspaceSidePanelPropsParams = {
  followedRailSide: "left" | "right";
  followedRailSelfViewerCountVisible: boolean;
  followedChannels: RailProps["channels"];
  followedChannelsLoading: boolean;
  followedChannelsError: string;
  streamIsLive: boolean;
  chatSidebarWidth: number;
  setChatSidebarWidth: Dispatch<SetStateAction<number>>;
  chatSidebarFontSize: number;
  setChatSidebarFontSize: Dispatch<SetStateAction<number>>;
  setFollowedRailSide: RailProps["onSideChange"];
  setFollowedRailSelfViewerCountVisible: Dispatch<SetStateAction<boolean>>;
  handleOpenOverlay: RailProps["onOpenOverlay"];
  handleOpenOverlayDebug: RailProps["onOpenOverlayDebug"];
  handleOpenPresent: RailProps["onOpenPresent"];
  handleOpenPresentDebug: RailProps["onOpenPresentDebug"];
  addIrcPreviewCard: (
    channelLogin: string,
    options?: { reveal?: boolean },
  ) => void;
  handleStartRaidToChannel: RailProps["onStartRaid"];
  handleStartShoutoutToChannel: RailProps["onStartShoutout"];
  chatSidebarActiveTabRequest: ChatSidebarProps["activeTabRequest"];
  setActiveChatSidebarTabId: ChatSidebarProps["onActiveTabChange"];
  hasPreviewForTab: ChatSidebarProps["hasPreviewForTab"];
  getSettingValue: (key: string) => string;
  handleSettingChange: (
    key: string,
    value: string,
    saveImmediately?: boolean,
  ) => void;
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  streamStatus: StreamStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  printerStatusInfo: PrinterStatusInfo | null;
  webServerPort: number;
  refreshingStreamStatus: boolean;
  reconnectingPrinter: boolean;
  testingPrinter: boolean;
  verifyingTwitch: boolean;
  handleTwitchAuth: () => Promise<void>;
  handleRefreshStreamStatus: () => Promise<void>;
  verifyTwitchConfig: (options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  handlePrinterReconnect: () => Promise<void>;
  handleTestPrint: () => Promise<void>;
  overlaySettings: OverlaySettingsState | null;
  updateOverlaySettings: StatusTopBarProps["updateOverlaySettings"];
  addWorkspaceCard: StatusTopBarProps["onAddCard"];
  canAddCard: StatusTopBarProps["canAddCard"];
};

type UseWorkspaceSidePanelPropsResult = {
  sidePanelProps: WorkspaceSidePanelsProps;
  topBarOffsets: { left: number; right: number };
};

const useWorkspacePanelDerivedValues = (
  params: Pick<
    UseWorkspaceSidePanelPropsParams,
    "followedChannels" | "followedRailSide" | "chatSidebarWidth"
  >,
) => {
  const cardMenuItems = useMemo<WorkspaceCardMenuItem[]>(
    () => BASE_WORKSPACE_MENU,
    [],
  );
  const railReservedWidth = FOLLOWED_RAIL_WIDTH_PX + params.chatSidebarWidth;
  const ircChannelDisplayNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const channel of params.followedChannels) {
      const login = (channel.broadcaster_login || "").trim().toLowerCase();
      const displayName = (channel.broadcaster_name || "").trim();
      if (!login || !displayName) continue;
      names[login] = displayName;
    }
    return names;
  }, [params.followedChannels]);
  const topBarOffsets = useMemo(
    () => ({
      left: params.followedRailSide === "left" ? railReservedWidth : 0,
      right: params.followedRailSide === "right" ? railReservedWidth : 0,
    }),
    [params.followedRailSide, railReservedWidth],
  );

  return { cardMenuItems, ircChannelDisplayNames, topBarOffsets };
};

const useWorkspaceSidebarSizeHandlers = (
  params: Pick<
    UseWorkspaceSidePanelPropsParams,
    "setChatSidebarWidth" | "setChatSidebarFontSize"
  >,
) => {
  const handleChatSidebarWidthChange = useCallback(
    (nextWidth: number) => {
      const clamped = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, nextWidth),
      );
      params.setChatSidebarWidth(clamped);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
      }
    },
    [params],
  );

  const handleChatSidebarFontSizeChange = useCallback(
    (nextSize: number) => {
      const clamped = Math.min(
        SIDEBAR_MAX_FONT_SIZE,
        Math.max(SIDEBAR_MIN_FONT_SIZE, nextSize),
      );
      params.setChatSidebarFontSize(clamped);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          SIDEBAR_FONT_SIZE_STORAGE_KEY,
          String(clamped),
        );
      }
    },
    [params],
  );

  return { handleChatSidebarWidthChange, handleChatSidebarFontSizeChange };
};

const useWorkspaceRailProps = (
  params: UseWorkspaceSidePanelPropsParams,
): RailProps =>
  useMemo(
    () => ({
      side: params.followedRailSide,
      channels: params.followedChannels,
      loading: params.followedChannelsLoading,
      error: params.followedChannelsError,
      canStartRaid: params.streamIsLive,
      chatWidth: params.chatSidebarWidth,
      twitchUserId: params.twitchUserInfo?.id,
      twitchAvatarUrl: params.twitchUserInfo?.profile_image_url,
      twitchDisplayName:
        params.twitchUserInfo?.display_name || params.twitchUserInfo?.login,
      streamViewerCount: params.streamStatus?.is_live
        ? params.streamStatus.viewer_count ?? 0
        : null,
      selfViewerCountVisible: params.followedRailSelfViewerCountVisible,
      onSelfViewerCountVisibleChange: (visible) =>
        params.setFollowedRailSelfViewerCountVisible(visible),
      onSideChange: params.setFollowedRailSide,
      onOpenOverlay: params.handleOpenOverlay,
      onOpenOverlayDebug: params.handleOpenOverlayDebug,
      onOpenPresent: params.handleOpenPresent,
      onOpenPresentDebug: params.handleOpenPresentDebug,
      onAddIrcPreview: params.addIrcPreviewCard,
      onStartRaid: params.handleStartRaidToChannel,
      onStartShoutout: params.handleStartShoutoutToChannel,
    }),
    [params],
  );

const useWorkspaceChatSidebarProps = (
  params: UseWorkspaceSidePanelPropsParams,
  ircChannelDisplayNames: Record<string, string>,
  handleChatSidebarWidthChange: (nextWidth: number) => void,
  handleChatSidebarFontSizeChange: (nextSize: number) => void,
): ChatSidebarProps =>
  useMemo(
    () => ({
      side: params.followedRailSide,
      width: params.chatSidebarWidth,
      onWidthChange: handleChatSidebarWidthChange,
      embedded: true,
      channelDisplayNames: ircChannelDisplayNames,
      activeTabRequest: params.chatSidebarActiveTabRequest,
      onActiveTabChange: params.setActiveChatSidebarTabId,
      onEnsureIrcPreview: (channelLogin) =>
        params.addIrcPreviewCard(channelLogin, { reveal: true }),
      hasPreviewForTab: params.hasPreviewForTab,
      fontSize: params.chatSidebarFontSize,
      onFontSizeChange: handleChatSidebarFontSizeChange,
      translationEnabled:
        params.getSettingValue("CHAT_TRANSLATION_ENABLED") !== "false",
      onTranslationToggle: (enabled) =>
        params.handleSettingChange("CHAT_TRANSLATION_ENABLED", enabled),
      notificationOverwrite:
        params.getSettingValue("NOTIFICATION_DISPLAY_MODE") === "overwrite",
      onNotificationModeToggle: (enabled) =>
        params.handleSettingChange(
          "NOTIFICATION_DISPLAY_MODE",
          enabled ? "overwrite" : "queue",
        ),
    }),
    [
      handleChatSidebarFontSizeChange,
      handleChatSidebarWidthChange,
      ircChannelDisplayNames,
      params,
    ],
  );

export const useWorkspaceSidePanelProps = (
  params: UseWorkspaceSidePanelPropsParams,
): UseWorkspaceSidePanelPropsResult => {
  const { cardMenuItems, ircChannelDisplayNames, topBarOffsets } =
    useWorkspacePanelDerivedValues(params);
  const { handleChatSidebarWidthChange, handleChatSidebarFontSizeChange } =
    useWorkspaceSidebarSizeHandlers(params);
  const railProps = useWorkspaceRailProps(params);
  const chatSidebarProps = useWorkspaceChatSidebarProps(
    params,
    ircChannelDisplayNames,
    handleChatSidebarWidthChange,
    handleChatSidebarFontSizeChange,
  );
  const statusTopBarProps = useWorkspaceStatusTopBarProps({
    topBarOffsets,
    featureStatus: params.featureStatus,
    authStatus: params.authStatus,
    streamStatus: params.streamStatus,
    twitchUserInfo: params.twitchUserInfo,
    printerStatusInfo: params.printerStatusInfo,
    webServerPort: params.webServerPort,
    refreshingStreamStatus: params.refreshingStreamStatus,
    reconnectingPrinter: params.reconnectingPrinter,
    testingPrinter: params.testingPrinter,
    verifyingTwitch: params.verifyingTwitch,
    handleTwitchAuth: params.handleTwitchAuth,
    handleRefreshStreamStatus: params.handleRefreshStreamStatus,
    verifyTwitchConfig: params.verifyTwitchConfig,
    handlePrinterReconnect: params.handlePrinterReconnect,
    handleTestPrint: params.handleTestPrint,
    overlaySettings: params.overlaySettings,
    updateOverlaySettings: params.updateOverlaySettings,
    cardMenuItems,
    addWorkspaceCard: params.addWorkspaceCard,
    addIrcPreviewCard: params.addIrcPreviewCard,
    canAddCard: params.canAddCard,
    ircChannelDisplayNames,
  });

  const sidePanelProps = useMemo(
    () => ({
      railProps,
      chatSidebarProps,
      statusTopBarProps,
    }),
    [chatSidebarProps, railProps, statusTopBarProps],
  );

  return useMemo(
    () => ({
      sidePanelProps,
      topBarOffsets,
    }),
    [sidePanelProps, topBarOffsets],
  );
};
