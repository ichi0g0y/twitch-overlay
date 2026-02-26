import type React from 'react';
import type { ChatMessage } from '../ChatSidebarItem';
import type {
  CachedUserProfileDetail,
  ChatDisplayModeByTab,
  ChatUserProfileDetail,
  MessageOrderReversedByTab,
  UserInfoPopupState,
} from './types';

export type UseChatSidebarLifecycleEffectsParams = {
  settingsOpen: boolean;
  settingsPanelRef: React.MutableRefObject<HTMLDivElement | null>;
  settingsButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  actionsMenuOpen: boolean;
  actionsMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
  actionsMenuButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  setActionsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPrimaryMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  ircChannels: string[];
  setIrcChannels: React.Dispatch<React.SetStateAction<string[]>>;
  setIrcMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  hydrateIrcUserProfile: (userId?: string, usernameHint?: string) => Promise<void>;
  activeTab: string;
  onActiveTabChange?: (tabId: string) => void;
  messageOrderReversedByTab: MessageOrderReversedByTab;
  chatDisplayModeByTab: ChatDisplayModeByTab;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  activeTabRequest: {
    tabId: string;
    requestId: number;
  } | null;
  lastHandledActiveTabRequestIdRef: React.MutableRefObject<number | null>;
  userInfoPopup: UserInfoPopupState | null;
  rawDataMessage: ChatMessage | null;
  isCollapsed: boolean;
  setUserInfoPopup: React.Dispatch<React.SetStateAction<UserInfoPopupState | null>>;
  setRawDataMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  setUserInfoIdCopied: React.Dispatch<React.SetStateAction<boolean>>;
  userInfoIdCopiedTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setRawDataCopied: React.Dispatch<React.SetStateAction<boolean>>;
  rawDataCopiedTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setUserInfoProfile: React.Dispatch<React.SetStateAction<ChatUserProfileDetail | null>>;
  setUserInfoLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInfoError: React.Dispatch<React.SetStateAction<string>>;
  setUserModerationLoading: React.Dispatch<React.SetStateAction<'timeout' | 'block' | null>>;
  setUserModerationMessage: React.Dispatch<React.SetStateAction<string>>;
  userProfileDetailCacheRef: React.MutableRefObject<Record<string, CachedUserProfileDetail>>;
  userInfoFetchSeqRef: React.MutableRefObject<number>;
  applyResolvedUserProfile: (profile: ChatUserProfileDetail) => void;
  setChattersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeChatDisplayMode: 'custom' | 'embed';
  setChannelEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  channelDisplayNames: Record<string, string>;
  displayNameRefreshTick: number;
  tabDisplayNamesByChannel: Record<string, string>;
  tabDisplayNameUpdatedAtByChannel: Record<string, number>;
  tabDisplayNameInFlightRef: React.MutableRefObject<Set<string>>;
  setTabDisplayNamesByChannel: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTabDisplayNameUpdatedAtByChannel: React.Dispatch<React.SetStateAction<Record<string, number>>>;
};
