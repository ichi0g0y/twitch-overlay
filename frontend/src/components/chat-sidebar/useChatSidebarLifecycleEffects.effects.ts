import { useEffect } from 'react';
import {
  PRIMARY_CHAT_TAB_ID,
  normalizeTwitchChannelName,
  subscribeIrcChannels,
  writeIrcChannels,
} from '../../utils/chatChannels';
import { useChannelDisplayNames } from './useChannelDisplayNames';
import { useIrcHistoryLoader } from './useIrcHistoryLoader';
import { usePrimaryChatStream } from './usePrimaryChatStream';
import { useUserInfoProfileLoader } from './useUserInfoProfileLoader';
import type { UseChatSidebarLifecycleEffectsParams } from './useChatSidebarLifecycleEffects.types';
import {
  ACTIVE_TAB_STORAGE_KEY,
  CHAT_DISPLAY_MODE_STORAGE_KEY,
  LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY,
  LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY,
  MESSAGE_ORDER_REVERSED_STORAGE_KEY,
} from './utils';

export const useChatSidebarMenuEffects = ({
  actionsMenuOpen,
  actionsMenuPanelRef,
  actionsMenuButtonRef,
  setActionsMenuOpen,
}: UseChatSidebarLifecycleEffectsParams) => {
  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsMenuPanelRef.current?.contains(target)) return;
      if (actionsMenuButtonRef.current?.contains(target)) return;
      setActionsMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [actionsMenuButtonRef, actionsMenuOpen, actionsMenuPanelRef, setActionsMenuOpen]);
};

export const useChatSidebarChannelEffects = ({
  setPrimaryMessages,
  ircChannels,
  ircHistoryChannels,
  setIrcChannels,
  setIrcMessagesByChannel,
  hydrateIrcUserProfile,
}: UseChatSidebarLifecycleEffectsParams) => {
  usePrimaryChatStream({ setPrimaryMessages });

  useEffect(() => {
    writeIrcChannels(ircChannels);
  }, [ircChannels]);

  useEffect(() => {
    const unsubscribe = subscribeIrcChannels((channels) => {
      setIrcChannels((prev) => {
        if (prev.length === channels.length && prev.every((item, idx) => item === channels[idx])) {
          return prev;
        }
        return channels;
      });
    });
    return unsubscribe;
  }, [setIrcChannels]);

  useIrcHistoryLoader({
    ircChannels: ircHistoryChannels,
    setIrcMessagesByChannel,
    hydrateIrcUserProfile,
  });
};

export const useChatSidebarPersistenceEffects = ({
  activeTab,
  onActiveTabChange,
  messageOrderReversedByTab,
  chatDisplayModeByTab,
  ircChannels,
  setActiveTab,
  activeTabRequest,
  lastHandledActiveTabRequestIdRef,
}: UseChatSidebarLifecycleEffectsParams) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY, JSON.stringify(messageOrderReversedByTab));
    window.localStorage.removeItem(LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY);
  }, [messageOrderReversedByTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHAT_DISPLAY_MODE_STORAGE_KEY, JSON.stringify(chatDisplayModeByTab));
    window.localStorage.removeItem(LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY);
  }, [chatDisplayModeByTab]);

  useEffect(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) return;
    if (ircChannels.includes(activeTab)) return;
    setActiveTab(PRIMARY_CHAT_TAB_ID);
  }, [activeTab, ircChannels, setActiveTab]);

  useEffect(() => {
    const request = activeTabRequest;
    if (!request) return;
    if (lastHandledActiveTabRequestIdRef.current === request.requestId) return;

    const requestedTabId = (request.tabId || '').trim();
    if (!requestedTabId) return;
    if (requestedTabId === PRIMARY_CHAT_TAB_ID) {
      lastHandledActiveTabRequestIdRef.current = request.requestId;
      setActiveTab(PRIMARY_CHAT_TAB_ID);
      return;
    }

    const normalizedRequested = normalizeTwitchChannelName(requestedTabId);
    if (!normalizedRequested || !ircChannels.includes(normalizedRequested)) return;
    lastHandledActiveTabRequestIdRef.current = request.requestId;
    setActiveTab(normalizedRequested);
  }, [activeTabRequest, ircChannels, lastHandledActiveTabRequestIdRef, setActiveTab]);
};

export const useChatSidebarPopupEffects = ({
  activeTab,
  isCollapsed,
  userInfoPopup,
  emoteInfoPopup,
  rawDataMessage,
  setUserInfoPopup,
  setEmoteInfoPopup,
  setRawDataMessage,
  setUserInfoIdCopied,
  userInfoIdCopiedTimerRef,
  setRawDataCopied,
  rawDataCopiedTimerRef,
  setUserInfoProfile,
  setUserInfoLoading,
  setUserInfoError,
  setUserModerationLoading,
  setUserModerationMessage,
  userProfileDetailCacheRef,
  userInfoFetchSeqRef,
  applyResolvedUserProfile,
}: UseChatSidebarLifecycleEffectsParams) => {
  useEffect(() => {
    if (!userInfoPopup && !emoteInfoPopup && !rawDataMessage) return;
    setUserInfoPopup(null);
    setEmoteInfoPopup(null);
    setRawDataMessage(null);
  }, [activeTab, isCollapsed, setEmoteInfoPopup, setRawDataMessage, setUserInfoPopup]);

  useEffect(() => {
    setUserInfoIdCopied(false);
    if (userInfoIdCopiedTimerRef.current !== null) {
      clearTimeout(userInfoIdCopiedTimerRef.current);
      userInfoIdCopiedTimerRef.current = null;
    }
  }, [setUserInfoIdCopied, userInfoIdCopiedTimerRef, userInfoPopup]);

  useEffect(() => {
    setRawDataCopied(false);
    if (rawDataCopiedTimerRef.current !== null) {
      clearTimeout(rawDataCopiedTimerRef.current);
      rawDataCopiedTimerRef.current = null;
    }
  }, [rawDataMessage, rawDataCopiedTimerRef, setRawDataCopied]);

  useEffect(() => {
    return () => {
      if (userInfoIdCopiedTimerRef.current !== null) {
        clearTimeout(userInfoIdCopiedTimerRef.current);
        userInfoIdCopiedTimerRef.current = null;
      }
      if (rawDataCopiedTimerRef.current !== null) {
        clearTimeout(rawDataCopiedTimerRef.current);
        rawDataCopiedTimerRef.current = null;
      }
    };
  }, [rawDataCopiedTimerRef, userInfoIdCopiedTimerRef]);

  useUserInfoProfileLoader({
    userInfoPopup,
    setUserInfoProfile,
    setUserInfoLoading,
    setUserInfoError,
    setUserModerationLoading,
    setUserModerationMessage,
    userProfileDetailCacheRef,
    userInfoFetchSeqRef,
    applyResolvedUserProfile,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userInfoPopup && !emoteInfoPopup && !rawDataMessage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserInfoPopup(null);
        setEmoteInfoPopup(null);
        setRawDataMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [emoteInfoPopup, rawDataMessage, setEmoteInfoPopup, setRawDataMessage, setUserInfoPopup, userInfoPopup]);
};

export const useChatSidebarModeEffects = ({
  isCollapsed,
  setChattersOpen,
  activeChatDisplayMode,
  setActionsMenuOpen,
  setUserInfoPopup,
  setEmoteInfoPopup,
  setRawDataMessage,
  setChannelEditorOpen,
}: UseChatSidebarLifecycleEffectsParams) => {
  useEffect(() => {
    if (isCollapsed) {
      setChattersOpen(false);
    }
  }, [isCollapsed, setChattersOpen]);

  useEffect(() => {
    if (activeChatDisplayMode !== 'embed') return;
    setChattersOpen(false);
    setUserInfoPopup(null);
    setEmoteInfoPopup(null);
    setRawDataMessage(null);
    setActionsMenuOpen(false);
    setChannelEditorOpen(false);
  }, [
    activeChatDisplayMode,
    setActionsMenuOpen,
    setChannelEditorOpen,
    setChattersOpen,
    setEmoteInfoPopup,
    setRawDataMessage,
    setUserInfoPopup,
  ]);
};

export const useChatSidebarDisplayNameEffects = ({
  ircChannels,
  channelDisplayNames,
  displayNameRefreshTick,
  tabDisplayNamesByChannel,
  tabDisplayNameUpdatedAtByChannel,
  tabDisplayNameInFlightRef,
  setTabDisplayNamesByChannel,
  setTabDisplayNameUpdatedAtByChannel,
}: UseChatSidebarLifecycleEffectsParams) => {
  useChannelDisplayNames({
    ircChannels,
    channelDisplayNames,
    displayNameRefreshTick,
    tabDisplayNamesByChannel,
    tabDisplayNameUpdatedAtByChannel,
    tabDisplayNameInFlightRef,
    setTabDisplayNamesByChannel,
    setTabDisplayNameUpdatedAtByChannel,
  });
};
