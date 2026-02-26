import { useCallback, useRef, useState } from 'react';
import {
  readIrcChannels,
} from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import type { RichChatInputRef } from '../chat/RichChatInput';
import type {
  CachedUserProfileDetail,
  ChatDisplayMode,
  ChatDisplayModeByTab,
  ChatUserProfileDetail,
  IrcConnection,
  IrcParticipant,
  IrcUserProfile,
  MessageOrderReversedByTab,
  UserInfoPopupState,
} from './types';
import {
  COLLAPSE_STORAGE_KEY,
  readStoredActiveTab,
  readStoredChatDisplayModeByTab,
  readStoredMessageOrderReversedByTab,
  resolveDefaultChatDisplayMode,
} from './utils';

export const useChatSidebarState = ({
  embedded,
}: {
  embedded: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  });
  const isCollapsed = embedded ? false : collapsed;

  const [primaryMessages, setPrimaryMessages] = useState<ChatMessage[]>([]);
  const [ircChannels, setIrcChannels] = useState<string[]>(() => readIrcChannels());
  const [activeTab, setActiveTab] = useState<string>(() => readStoredActiveTab());
  const [ircMessagesByChannel, setIrcMessagesByChannel] = useState<Record<string, ChatMessage[]>>({});
  const [connectingChannels, setConnectingChannels] = useState<Record<string, boolean>>({});
  const [primaryChannelLogin, setPrimaryChannelLogin] = useState('');
  const [chatDisplayModeByTab, setChatDisplayModeByTab] = useState<ChatDisplayModeByTab>(() => readStoredChatDisplayModeByTab());

  const activeChatDisplayMode = chatDisplayModeByTab[activeTab] ?? resolveDefaultChatDisplayMode(activeTab);
  const setActiveChatDisplayMode = useCallback((mode: ChatDisplayMode) => {
    setChatDisplayModeByTab((prev) => {
      const defaultMode = resolveDefaultChatDisplayMode(activeTab);
      const current = prev[activeTab];
      if (mode === defaultMode) {
        if (current === undefined) return prev;
        const next = { ...prev };
        delete next[activeTab];
        return next;
      }
      if (current === mode) return prev;
      return { ...prev, [activeTab]: mode };
    });
  }, [activeTab]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const tabScrollerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [resizing, setResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [channelEditorOpen, setChannelEditorOpen] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [channelInputError, setChannelInputError] = useState('');
  const [embedReloadNonceByTab, setEmbedReloadNonceByTab] = useState<Record<string, number>>({});
  const [loadedEmbedTabIds, setLoadedEmbedTabIds] = useState<Record<string, true>>({});
  const [loadedCustomTabIds, setLoadedCustomTabIds] = useState<Record<string, true>>({});

  const richInputRef = useRef<RichChatInputRef | null>(null);
  const postingMessageLockRef = useRef(false);
  const [inputHasContent, setInputHasContent] = useState(false);
  const [postingMessage, setPostingMessage] = useState(false);
  const [postError, setPostError] = useState('');
  const [messageOrderReversedByTab, setMessageOrderReversedByTab] = useState<MessageOrderReversedByTab>(() => readStoredMessageOrderReversedByTab());
  const [chattersOpen, setChattersOpen] = useState(false);
  const [userInfoPopup, setUserInfoPopup] = useState<UserInfoPopupState | null>(null);
  const [rawDataMessage, setRawDataMessage] = useState<ChatMessage | null>(null);
  const [userInfoProfile, setUserInfoProfile] = useState<ChatUserProfileDetail | null>(null);
  const [userInfoLoading, setUserInfoLoading] = useState(false);
  const [userInfoError, setUserInfoError] = useState('');
  const [userModerationLoading, setUserModerationLoading] = useState<'timeout' | 'block' | null>(null);
  const [userModerationMessage, setUserModerationMessage] = useState('');
  const [userInfoIdCopied, setUserInfoIdCopied] = useState(false);
  const [rawDataCopied, setRawDataCopied] = useState(false);

  const ircConnectionsRef = useRef<Map<string, IrcConnection>>(new Map());
  const ircUserProfilesRef = useRef<Record<string, IrcUserProfile>>({});
  const ircParticipantsByChannelRef = useRef<Record<string, Record<string, IrcParticipant>>>({});
  const ircProfileInFlightRef = useRef<Set<string>>(new Set());
  const ircRecentRawLinesRef = useRef<Map<string, number>>(new Map());
  const ircRecentMessageKeysRef = useRef<Map<string, number>>(new Map());
  const userProfileDetailCacheRef = useRef<Record<string, CachedUserProfileDetail>>({});
  const userInfoFetchSeqRef = useRef(0);
  const userInfoIdCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawDataCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabDisplayNameInFlightRef = useRef<Set<string>>(new Set());

  const [tabDisplayNamesByChannel, setTabDisplayNamesByChannel] = useState<Record<string, string>>({});
  const [tabDisplayNameUpdatedAtByChannel, setTabDisplayNameUpdatedAtByChannel] = useState<Record<string, number>>({});
  const [displayNameRefreshTick, setDisplayNameRefreshTick] = useState(0);
  const [primaryCredentialRefreshTick, setPrimaryCredentialRefreshTick] = useState(0);
  const [ircParticipantsVersion, setIrcParticipantsVersion] = useState(0);
  const lastHandledActiveTabRequestIdRef = useRef<number | null>(null);

  return {
    collapsed,
    setCollapsed,
    isCollapsed,
    primaryMessages,
    setPrimaryMessages,
    ircChannels,
    setIrcChannels,
    activeTab,
    setActiveTab,
    ircMessagesByChannel,
    setIrcMessagesByChannel,
    connectingChannels,
    setConnectingChannels,
    primaryChannelLogin,
    setPrimaryChannelLogin,
    chatDisplayModeByTab,
    setChatDisplayModeByTab,
    activeChatDisplayMode,
    setActiveChatDisplayMode,
    listRef,
    tabScrollerRef,
    tabButtonRefs,
    resizing,
    setResizing,
    resizeStateRef,
    actionsMenuOpen,
    setActionsMenuOpen,
    actionsMenuButtonRef,
    actionsMenuPanelRef,
    channelEditorOpen,
    setChannelEditorOpen,
    channelInput,
    setChannelInput,
    channelInputError,
    setChannelInputError,
    embedReloadNonceByTab,
    setEmbedReloadNonceByTab,
    loadedEmbedTabIds,
    setLoadedEmbedTabIds,
    loadedCustomTabIds,
    setLoadedCustomTabIds,
    richInputRef,
    postingMessageLockRef,
    inputHasContent,
    setInputHasContent,
    postingMessage,
    setPostingMessage,
    postError,
    setPostError,
    messageOrderReversedByTab,
    setMessageOrderReversedByTab,
    chattersOpen,
    setChattersOpen,
    userInfoPopup,
    setUserInfoPopup,
    rawDataMessage,
    setRawDataMessage,
    userInfoProfile,
    setUserInfoProfile,
    userInfoLoading,
    setUserInfoLoading,
    userInfoError,
    setUserInfoError,
    userModerationLoading,
    setUserModerationLoading,
    userModerationMessage,
    setUserModerationMessage,
    userInfoIdCopied,
    setUserInfoIdCopied,
    rawDataCopied,
    setRawDataCopied,
    ircConnectionsRef,
    ircUserProfilesRef,
    ircParticipantsByChannelRef,
    ircProfileInFlightRef,
    ircRecentRawLinesRef,
    ircRecentMessageKeysRef,
    userProfileDetailCacheRef,
    userInfoFetchSeqRef,
    userInfoIdCopiedTimerRef,
    rawDataCopiedTimerRef,
    tabDisplayNameInFlightRef,
    tabDisplayNamesByChannel,
    setTabDisplayNamesByChannel,
    tabDisplayNameUpdatedAtByChannel,
    setTabDisplayNameUpdatedAtByChannel,
    displayNameRefreshTick,
    setDisplayNameRefreshTick,
    primaryCredentialRefreshTick,
    setPrimaryCredentialRefreshTick,
    ircParticipantsVersion,
    setIrcParticipantsVersion,
    lastHandledActiveTabRequestIdRef,
  };
};
