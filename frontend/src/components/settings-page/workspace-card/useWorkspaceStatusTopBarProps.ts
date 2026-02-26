import { useMemo, type ComponentProps } from "react";
import type { OverlaySettings as OverlaySettingsState } from "../../../contexts/SettingsContext";
import type {
  AuthStatus,
  FeatureStatus,
  PrinterStatusInfo,
  StreamStatus,
  TwitchUserInfo,
} from "../../../types";
import { WorkspaceSidePanels } from "./WorkspaceSidePanels";
import type { WorkspaceCardMenuItem } from "./types";

type StatusTopBarProps = ComponentProps<
  typeof WorkspaceSidePanels
>["statusTopBarProps"];

type UseWorkspaceStatusTopBarPropsParams = {
  topBarOffsets: { left: number; right: number };
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
  cardMenuItems: WorkspaceCardMenuItem[];
  addWorkspaceCard: StatusTopBarProps["onAddCard"];
  addIrcPreviewCard: (channelLogin: string, options?: { reveal?: boolean }) => void;
  canAddCard: StatusTopBarProps["canAddCard"];
  ircChannelDisplayNames: Record<string, string>;
};

export const useWorkspaceStatusTopBarProps = ({
  topBarOffsets,
  featureStatus,
  authStatus,
  streamStatus,
  twitchUserInfo,
  printerStatusInfo,
  webServerPort,
  refreshingStreamStatus,
  reconnectingPrinter,
  testingPrinter,
  verifyingTwitch,
  handleTwitchAuth,
  handleRefreshStreamStatus,
  verifyTwitchConfig,
  handlePrinterReconnect,
  handleTestPrint,
  overlaySettings,
  updateOverlaySettings,
  cardMenuItems,
  addWorkspaceCard,
  addIrcPreviewCard,
  canAddCard,
  ircChannelDisplayNames,
}: UseWorkspaceStatusTopBarPropsParams): StatusTopBarProps =>
  useMemo(
    () => ({
      leftOffset: topBarOffsets.left,
      rightOffset: topBarOffsets.right,
      featureStatus,
      authStatus,
      streamStatus,
      twitchUserInfo,
      printerStatusInfo,
      webServerPort,
      refreshingStreamStatus,
      reconnectingPrinter,
      testingPrinter,
      verifyingTwitch,
      onTwitchAuth: handleTwitchAuth,
      onRefreshStreamStatus: handleRefreshStreamStatus,
      onVerifyTwitchConfig: verifyTwitchConfig,
      onPrinterReconnect: handlePrinterReconnect,
      onTestPrint: handleTestPrint,
      overlaySettings,
      updateOverlaySettings,
      cardMenuItems,
      onAddCard: addWorkspaceCard,
      onAddIrcPreview: addIrcPreviewCard,
      canAddCard,
      ircChannelDisplayNames,
    }),
    [
      addIrcPreviewCard,
      addWorkspaceCard,
      authStatus,
      canAddCard,
      cardMenuItems,
      featureStatus,
      handlePrinterReconnect,
      handleRefreshStreamStatus,
      handleTestPrint,
      handleTwitchAuth,
      ircChannelDisplayNames,
      overlaySettings,
      printerStatusInfo,
      reconnectingPrinter,
      refreshingStreamStatus,
      streamStatus,
      testingPrinter,
      topBarOffsets.left,
      topBarOffsets.right,
      twitchUserInfo,
      updateOverlaySettings,
      verifyTwitchConfig,
      verifyingTwitch,
      webServerPort,
    ],
  );
