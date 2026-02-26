import React, { useEffect, useMemo } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import { ChatSidebarLayout } from './ChatSidebarLayout';
import { useChatSidebarActions } from './useChatSidebarActions';
import { useChatSidebarDisplayState } from './useChatSidebarDisplayState';
import { useChatSidebarLifecycleEffects } from './useChatSidebarLifecycleEffects';
import { useChatSidebarState } from './useChatSidebarState';
import { useIrcBadges } from './useIrcBadges';
import { useIrcConnectionManager } from './useIrcConnectionManager';
import { useIrcParticipantActions } from './useIrcParticipantActions';
import { useIrcProfileActions } from './useIrcProfileActions';
import { useUserInfoActions } from './useUserInfoActions';
import { buildUserInfoViewModel } from './userInfoViewModel';
import {
  COLLAPSE_STORAGE_KEY,
  DISPLAY_NAME_REFRESH_TICK_MS,
  PRIMARY_IRC_CREDENTIAL_REFRESH_MS,
  RESIZE_MAX_WIDTH,
  RESIZE_MIN_WIDTH,
} from './utils';

type SidebarSide = 'left' | 'right';

type ChatSidebarProps = {
  side: SidebarSide;
  width: number;
  onWidthChange: (width: number) => void;
  avoidEdgeRail?: boolean;
  embedded?: boolean;
  channelDisplayNames?: Record<string, string>;
  activeTabRequest?: {
    tabId: string;
    requestId: number;
  } | null;
  onActiveTabChange?: (tabId: string) => void;
  onEnsureIrcPreview?: (channelLogin: string) => void;
  hasPreviewForTab?: (tabId: string) => boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  translationEnabled: boolean;
  onTranslationToggle: (enabled: boolean) => void;
  notificationOverwrite: boolean;
  onNotificationModeToggle: (enabled: boolean) => void;
};

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  side,
  width,
  onWidthChange,
  avoidEdgeRail = false,
  embedded = false,
  channelDisplayNames = {},
  activeTabRequest = null,
  onActiveTabChange,
  onEnsureIrcPreview,
  hasPreviewForTab,
  fontSize,
  onFontSizeChange,
  translationEnabled,
  onTranslationToggle,
  notificationOverwrite,
  onNotificationModeToggle,
}) => {
  const state = useChatSidebarState({ embedded });
  const loadedTabIds = useMemo(
    () => ({
      ...state.loadedCustomTabIds,
      ...state.loadedEmbedTabIds,
    }),
    [state.loadedCustomTabIds, state.loadedEmbedTabIds],
  );
  const ircHistoryChannels = useMemo(
    () => state.ircChannels.filter((channel) => loadedTabIds[channel] === true),
    [loadedTabIds, state.ircChannels],
  );
  const enablePrimaryIrcConnection = loadedTabIds[PRIMARY_CHAT_TAB_ID] === true;

  useEffect(() => {
    state.setLoadedCustomTabIds((prev) => {
      if (prev[state.activeTab]) return prev;
      return { ...prev, [state.activeTab]: true };
    });
    state.setLoadedEmbedTabIds((prev) => {
      if (prev[state.activeTab]) return prev;
      return { ...prev, [state.activeTab]: true };
    });
  }, [
    state.activeTab,
    state.setLoadedCustomTabIds,
    state.setLoadedEmbedTabIds,
  ]);

  const handleToggle = () => {
    if (embedded) return;
    state.setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (state.isCollapsed) return;
    event.preventDefault();
    state.resizeStateRef.current = { startX: event.clientX, startWidth: width };
    state.setResizing(true);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      state.setDisplayNameRefreshTick((current) => current + 1);
    }, DISPLAY_NAME_REFRESH_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setInterval(() => {
      state.setPrimaryCredentialRefreshTick((current) => current + 1);
    }, PRIMARY_IRC_CREDENTIAL_REFRESH_MS);

    const isTauriRuntime = typeof (window as any).__TAURI__ !== 'undefined'
      || typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
    const tauriUnlisteners: Promise<UnlistenFn>[] = [];

    if (isTauriRuntime) {
      tauriUnlisteners.push(listen('auth_success', () => {
        state.setPrimaryCredentialRefreshTick((current) => current + 1);
      }));
    }

    return () => {
      window.clearInterval(timer);
      tauriUnlisteners.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(() => undefined);
      });
    };
  }, []);

  const ircParticipantActions = useIrcParticipantActions({
    setIrcMessagesByChannel: state.setIrcMessagesByChannel,
    ircUserProfilesRef: state.ircUserProfilesRef,
    ircParticipantsByChannelRef: state.ircParticipantsByChannelRef,
    setIrcParticipantsVersion: state.setIrcParticipantsVersion,
    ircRecentRawLinesRef: state.ircRecentRawLinesRef,
    ircRecentMessageKeysRef: state.ircRecentMessageKeysRef,
  });

  const ircProfileActions = useIrcProfileActions({
    setIrcMessagesByChannel: state.setIrcMessagesByChannel,
    setPrimaryMessages: state.setPrimaryMessages,
    ircUserProfilesRef: state.ircUserProfilesRef,
    ircProfileInFlightRef: state.ircProfileInFlightRef,
  });

  const ircConnectionActions = useIrcConnectionManager({
    ...state,
    activeCustomIrcChannels: ircHistoryChannels,
    enablePrimaryConnection: enablePrimaryIrcConnection,
    appendIrcMessage: ircParticipantActions.appendIrcMessage,
    upsertIrcParticipant: ircParticipantActions.upsertIrcParticipant,
    applyIrcNames: ircParticipantActions.applyIrcNames,
    removeIrcParticipant: ircParticipantActions.removeIrcParticipant,
    shouldIgnoreDuplicateIrcLine: ircParticipantActions.shouldIgnoreDuplicateIrcLine,
    shouldIgnoreDuplicateIrcMessage: ircParticipantActions.shouldIgnoreDuplicateIrcMessage,
    persistIrcMessage: ircParticipantActions.persistIrcMessage,
    hydrateIrcUserProfile: ircProfileActions.hydrateIrcUserProfile,
  });

  const ircBadges = useIrcBadges({
    activeTab: state.activeTab,
    primaryChannelLogin: state.primaryChannelLogin,
  });

  useEffect(() => {
    if (!state.resizing) return;
    const handleMove = (event: PointerEvent) => {
      if (!state.resizeStateRef.current) return;
      const delta = event.clientX - state.resizeStateRef.current.startX;
      const direction = side === 'left' ? 1 : -1;
      const nextWidth = Math.min(
        RESIZE_MAX_WIDTH,
        Math.max(RESIZE_MIN_WIDTH, state.resizeStateRef.current.startWidth + delta * direction),
      );
      onWidthChange(nextWidth);
    };

    const handleUp = () => {
      state.resizeStateRef.current = null;
      state.setResizing(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onWidthChange, side, state.resizing]);

  useChatSidebarLifecycleEffects({
    ...state,
    ircHistoryChannels,
    hydrateIrcUserProfile: ircProfileActions.hydrateIrcUserProfile,
    onActiveTabChange,
    activeTabRequest,
    applyResolvedUserProfile: ircProfileActions.applyResolvedUserProfile,
    channelDisplayNames,
  });

  const displayState = useChatSidebarDisplayState({
    ...state,
    loadedEmbedTabIds: loadedTabIds,
    side,
    width,
    onWidthChange,
    avoidEdgeRail,
    embedded,
    fontSize,
    channelDisplayNames,
  });

  const userInfoViewModel = useMemo(
    () => buildUserInfoViewModel({ userInfoProfile: state.userInfoProfile, userInfoPopup: state.userInfoPopup }),
    [state.userInfoPopup, state.userInfoProfile],
  );

  const rawDataJson = useMemo(
    () => (state.rawDataMessage ? JSON.stringify(state.rawDataMessage, null, 2) : ''),
    [state.rawDataMessage],
  );

  const userInfoActions = useUserInfoActions({
    userInfoResolvedUserId: userInfoViewModel.userInfoResolvedUserId,
    rawDataJson,
    userInfoCanTimeout: userInfoViewModel.userInfoCanTimeout,
    userInfoCanBlock: userInfoViewModel.userInfoCanBlock,
    userModerationLoading: state.userModerationLoading,
    moderationTargetName: userInfoViewModel.moderationTargetName,
    setUserInfoError: state.setUserInfoError,
    setUserModerationMessage: state.setUserModerationMessage,
    setUserModerationLoading: state.setUserModerationLoading,
    setUserInfoIdCopied: state.setUserInfoIdCopied,
    setRawDataCopied: state.setRawDataCopied,
    userInfoIdCopiedTimerRef: state.userInfoIdCopiedTimerRef,
    rawDataCopiedTimerRef: state.rawDataCopiedTimerRef,
  });

  const chatActions = useChatSidebarActions({
    ...state,
    startIrcConnection: ircConnectionActions.startIrcConnection,
    stopIrcConnection: ircConnectionActions.stopIrcConnection,
    hydrateIrcUserProfile: ircProfileActions.hydrateIrcUserProfile,
    onEnsureIrcPreview,
    clearIrcParticipants: ircParticipantActions.clearIrcParticipants,
    popoutChatUrl: displayState.popoutChatUrl,
  });

  return (
    <ChatSidebarLayout
      {...state}
      {...displayState}
      {...userInfoViewModel}
      {...chatActions}
      {...userInfoActions}
      {...ircBadges}
      embedded={embedded}
      fontSize={fontSize}
      translationEnabled={translationEnabled}
      notificationOverwrite={notificationOverwrite}
      onEnsureIrcPreview={onEnsureIrcPreview}
      hasPreviewForTab={hasPreviewForTab}
      onFontSizeChange={onFontSizeChange}
      onTranslationToggle={onTranslationToggle}
      onNotificationModeToggle={onNotificationModeToggle}
      handleToggle={handleToggle}
      handleResizeStart={handleResizeStart}
      rawDataJson={rawDataJson}
      isPrimaryTab={state.activeTab === PRIMARY_CHAT_TAB_ID}
    />
  );
};
