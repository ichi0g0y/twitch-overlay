import { useMemo, type ChangeEvent, type ContextType, type RefObject } from "react";
import { SettingsPageContext } from "../../../hooks/useSettingsPage";
import type {
  AuthStatus,
  FeatureStatus,
  StreamStatus,
  TwitchUserInfo,
} from "../../../types";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";
import {
  createPreviewHeaderResolver,
  createWorkspaceCardRenderer,
} from "./renderers";
import { isCollapsibleCardNodeKind, resolveWorkspaceCardMinSize } from "./node";
import type {
  RemoveWorkspaceCardOptions,
  WorkspaceCardKind,
  WorkspaceRenderContextValue,
} from "./types";

type SettingsPageValue = NonNullable<ContextType<typeof SettingsPageContext>>;

type UseWorkspaceRenderContextParams = {
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  previewPortalEnabled: boolean;
  isPreviewInteractionEnabled: (kind: WorkspaceCardKind) => boolean;
  setPreviewWarning: (kind: WorkspaceCardKind, warningMessage: string | null) => void;
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
  activeChatSidebarTabId: string;
  followedChannels: FollowedChannelRailItem[];
  previewWarningByKind: Partial<Record<WorkspaceCardKind, string>>;
  removeWorkspaceCard: (
    nodeId: string,
    options?: RemoveWorkspaceCardOptions,
  ) => void;
  refreshPreview: (kind: WorkspaceCardKind) => void;
  togglePreviewViewportExpand: (
    id: string,
    options?: { forceExpand?: boolean },
  ) => void;
  isPreviewViewportExpanded: (id: string) => boolean;
  togglePreviewInteraction: (kind: WorkspaceCardKind) => void;
  snapWorkspaceCardSize: (id: string, width: number, height: number) => void;
};

export const useWorkspaceRenderContext = ({
  featureStatus,
  authStatus,
  twitchUserInfo,
  previewPortalEnabled,
  isPreviewInteractionEnabled,
  setPreviewWarning,
  getSettingValue,
  handleSettingChange,
  getBooleanValue,
  streamStatus,
  fileInputRef,
  uploadingFont,
  handleFontUpload,
  previewText,
  setPreviewText,
  previewImage,
  handleFontPreview,
  handleDeleteFont,
  handleTestNotification,
  testingNotification,
  contextValue,
  previewReloadNonceByKind,
  activeChatSidebarTabId,
  followedChannels,
  previewWarningByKind,
  removeWorkspaceCard,
  refreshPreview,
  togglePreviewViewportExpand,
  isPreviewViewportExpanded,
  togglePreviewInteraction,
  snapWorkspaceCardSize,
}: UseWorkspaceRenderContextParams): WorkspaceRenderContextValue => {
  const renderWorkspaceCard = useMemo(
    () =>
      createWorkspaceCardRenderer({
        featureStatus,
        authStatus,
        twitchUserInfo,
        previewPortalEnabled,
        isPreviewInteractionEnabled,
        setPreviewWarning,
        getSettingValue,
        handleSettingChange,
        getBooleanValue,
        streamStatus,
        fileInputRef,
        uploadingFont,
        handleFontUpload,
        previewText,
        setPreviewText,
        previewImage,
        handleFontPreview,
        handleDeleteFont,
        handleTestNotification,
        testingNotification,
        contextValue,
        previewReloadNonceByKind,
      }),
    [
      authStatus,
      contextValue,
      featureStatus,
      fileInputRef,
      getBooleanValue,
      getSettingValue,
      handleDeleteFont,
      handleFontPreview,
      handleFontUpload,
      handleSettingChange,
      handleTestNotification,
      isPreviewInteractionEnabled,
      previewImage,
      previewPortalEnabled,
      previewReloadNonceByKind,
      previewText,
      setPreviewText,
      setPreviewWarning,
      streamStatus,
      testingNotification,
      twitchUserInfo,
      uploadingFont,
    ],
  );

  const resolvePreviewHeader = useMemo(
    () =>
      createPreviewHeaderResolver({
        activeChatSidebarTabId,
        twitchUserInfo,
        streamStatus,
        followedChannels,
        previewWarningByKind,
      }),
    [
      activeChatSidebarTabId,
      followedChannels,
      previewWarningByKind,
      streamStatus,
      twitchUserInfo,
    ],
  );

  return useMemo(
    () => ({
      removeCard: removeWorkspaceCard,
      refreshPreview,
      togglePreviewViewportExpand,
      isPreviewViewportExpanded,
      isPreviewInteractionEnabled,
      togglePreviewInteraction,
      previewPortalEnabled,
      resolveCardMinSize: resolveWorkspaceCardMinSize,
      isCollapsibleCardNodeKind,
      snapCardSize: snapWorkspaceCardSize,
      renderCard: renderWorkspaceCard,
      resolvePreviewHeader,
    }),
    [
      removeWorkspaceCard,
      refreshPreview,
      togglePreviewViewportExpand,
      isPreviewViewportExpanded,
      isPreviewInteractionEnabled,
      togglePreviewInteraction,
      previewPortalEnabled,
      snapWorkspaceCardSize,
      renderWorkspaceCard,
      resolvePreviewHeader,
    ],
  );
};
