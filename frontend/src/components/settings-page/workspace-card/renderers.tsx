import type {
  ChangeEvent,
  ContextType,
  ReactNode,
  RefObject,
} from "react";
import { SettingsPageContext } from "../../../hooks/useSettingsPage";
import type {
  AuthStatus,
  FeatureStatus,
  StreamStatus,
  TwitchUserInfo,
} from "../../../types";
import { ApiTab } from "../../settings/ApiTab";
import { CacheSettings } from "../../settings/CacheSettings";
import { GeneralSettings } from "../../settings/GeneralSettings";
import { LogsTab } from "../../settings/LogsTab";
import { MicTranscriptionSettings } from "../../settings/MicTranscriptionSettings";
import { MusicSettings } from "../../settings/MusicSettings";
import {
  OverlaySettings,
  type OverlayCardKey,
} from "../../settings/OverlaySettings";
import { PrinterSettings } from "../../settings/PrinterSettings";
import { TwitchSettings } from "../../settings/TwitchSettings";
import {
  AddedChannelStreamPreview,
  TwitchStreamPreview,
} from "../preview/StreamPreviewCards";
import { isPreviewIrcKind } from "./kinds";
import type { WorkspaceCardKind } from "./types";
export { createPreviewHeaderResolver } from "./previewHeaderResolver";

type SettingsPageValue = NonNullable<ContextType<typeof SettingsPageContext>>;

type PreviewWarningSetter = (
  kind: WorkspaceCardKind,
  warningMessage: string | null,
) => void;

type WorkspaceCardRendererDeps = {
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  previewPortalEnabled: boolean;
  isPreviewInteractionEnabled: (kind: WorkspaceCardKind) => boolean;
  setPreviewWarning: PreviewWarningSetter;
  getSettingValue: (key: string) => string;
  handleSettingChange: (
    key: string,
    value: string,
    saveImmediately?: boolean,
  ) => void;
  getBooleanValue: (key: string) => boolean;
  streamStatus: StreamStatus | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploadingFont: boolean;
  handleFontUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  previewText: string;
  setPreviewText: (text: string) => void;
  previewImage: string;
  handleFontPreview: (showSuccess?: boolean) => Promise<void>;
  handleDeleteFont: () => Promise<void>;
  handleTestNotification: () => Promise<void>;
  testingNotification: boolean;
  contextValue: SettingsPageValue;
  previewReloadNonceByKind: Record<string, number>;
};

const withSettingsPageProvider = (
  deps: WorkspaceCardRendererDeps,
  node: ReactNode,
) => {
  return <SettingsPageContext.Provider value={deps.contextValue}>{node}</SettingsPageContext.Provider>;
};

const renderPreviewCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
  reloadNonce: number,
): ReactNode | null => {
  if (kind === "preview-main") {
    return (
      <TwitchStreamPreview
        isTwitchConfigured={Boolean(deps.featureStatus?.twitch_configured)}
        isAuthenticated={Boolean(deps.authStatus?.authenticated)}
        channelLogin={deps.twitchUserInfo?.login ?? ""}
        reloadNonce={reloadNonce}
        autoplayEnabled={deps.previewPortalEnabled}
        interactionDisabled={!deps.isPreviewInteractionEnabled("preview-main")}
        onWarningChange={(warningMessage) =>
          deps.setPreviewWarning("preview-main", warningMessage)
        }
      />
    );
  }
  if (!isPreviewIrcKind(kind)) return null;
  const channelLogin = kind.slice("preview-irc:".length);
  return (
    <AddedChannelStreamPreview
      kind={kind}
      channelLogin={channelLogin}
      reloadNonce={reloadNonce}
      autoplayEnabled={deps.previewPortalEnabled}
      interactionDisabled={!deps.isPreviewInteractionEnabled(kind)}
      onWarningChange={deps.setPreviewWarning}
    />
  );
};

const resolveGeneralSection = (kind: WorkspaceCardKind) => {
  if (kind === "general-basic") return "basic";
  if (kind === "general-notification") return "notification";
  if (kind === "general-font") return "font";
  return null;
};

const renderGeneralCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
) => {
  const section = resolveGeneralSection(kind);
  if (!section) return null;
  return (
    <GeneralSettings
      getSettingValue={deps.getSettingValue}
      handleSettingChange={deps.handleSettingChange}
      getBooleanValue={deps.getBooleanValue}
      streamStatus={deps.streamStatus}
      fileInputRef={deps.fileInputRef}
      uploadingFont={deps.uploadingFont}
      handleFontUpload={deps.handleFontUpload}
      previewText={deps.previewText}
      setPreviewText={deps.setPreviewText}
      previewImage={deps.previewImage}
      handleFontPreview={deps.handleFontPreview}
      handleDeleteFont={deps.handleDeleteFont}
      handleTestNotification={deps.handleTestNotification}
      testingNotification={deps.testingNotification}
      sections={[section]}
    />
  );
};

const resolveCacheSection = (kind: WorkspaceCardKind) => {
  if (kind === "cache-stats") return "stats";
  if (kind === "cache-config") return "config";
  if (kind === "cache-actions") return "actions";
  return null;
};

const renderCacheCard = (kind: WorkspaceCardKind) => {
  const section = resolveCacheSection(kind);
  if (!section) return null;
  return <CacheSettings sections={[section]} />;
};

const renderSimpleCard = (kind: WorkspaceCardKind) => {
  if (kind === "music-manager") return <MusicSettings />;
  if (kind === "logs") return <LogsTab />;
  if (kind === "api") return <ApiTab />;
  return null;
};

const resolveMicSection = (kind: WorkspaceCardKind) => {
  if (kind === "mic-speech") return "speech";
  if (kind === "mic-overlay-display") return "overlayDisplay";
  return null;
};

const renderMicCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
) => {
  const section = resolveMicSection(kind);
  if (!section) return null;
  return withSettingsPageProvider(
    deps,
    <MicTranscriptionSettings sections={[section]} />,
  );
};

const resolveTwitchSection = (kind: WorkspaceCardKind) => {
  if (kind === "twitch-api") return "api";
  if (kind === "twitch-reward-groups") return "rewardGroups";
  if (kind === "twitch-custom-rewards") return "customRewards";
  return null;
};

const renderTwitchCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
) => {
  const section = resolveTwitchSection(kind);
  if (!section) return null;
  return withSettingsPageProvider(deps, <TwitchSettings sections={[section]} />);
};

const resolvePrinterSection = (kind: WorkspaceCardKind) => {
  if (kind === "printer-type") return "type";
  if (kind === "printer-bluetooth") return "bluetooth";
  if (kind === "printer-usb") return "usb";
  if (kind === "printer-print") return "print";
  if (kind === "printer-clock") return "clock";
  return null;
};

const renderPrinterCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
) => {
  const section = resolvePrinterSection(kind);
  if (!section) return null;
  return withSettingsPageProvider(deps, <PrinterSettings sections={[section]} />);
};

const resolveOverlayFocusCard = (kind: WorkspaceCardKind): OverlayCardKey | null => {
  if (kind === "overlay-music-player") return "musicPlayer";
  if (kind === "overlay-fax") return "fax";
  if (kind === "overlay-clock") return "clock";
  if (kind === "overlay-mic-transcript") return "micTranscript";
  if (kind === "overlay-reward-count") return "rewardCount";
  if (kind === "overlay-lottery") return "lottery";
  return null;
};

const renderOverlayCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
) => {
  const focusCard = resolveOverlayFocusCard(kind);
  if (!focusCard) return null;
  return withSettingsPageProvider(deps, <OverlaySettings focusCard={focusCard} />);
};

const renderSettingsCard = (
  kind: WorkspaceCardKind,
  deps: WorkspaceCardRendererDeps,
): ReactNode | null => {
  return (
    renderGeneralCard(kind, deps) ??
    renderSimpleCard(kind) ??
    renderCacheCard(kind) ??
    renderMicCard(kind, deps) ??
    renderTwitchCard(kind, deps) ??
    renderPrinterCard(kind, deps) ??
    renderOverlayCard(kind, deps)
  );
};

export const createWorkspaceCardRenderer = (
  deps: WorkspaceCardRendererDeps,
): ((kind: WorkspaceCardKind) => ReactNode) => {
  return (kind: WorkspaceCardKind) => {
    const reloadNonce = deps.previewReloadNonceByKind[kind] ?? 0;
    const previewCard = renderPreviewCard(kind, deps, reloadNonce);
    if (previewCard) return previewCard;
    const settingsCard = renderSettingsCard(kind, deps);
    if (settingsCard) return settingsCard;
    return <div className="text-xs text-gray-400">未対応カード</div>;
  };
};
