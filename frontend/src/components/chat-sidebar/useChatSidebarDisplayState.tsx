import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { useMemo } from 'react';
import type React from 'react';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import type { ChattersPanelChatter } from '../ChattersPanel';
import type { ChatMessage } from '../ChatSidebarItem';
import type { ChatDisplayItem, IrcParticipant, MessageOrderReversedByTab } from './types';
import { COLLAPSED_DESKTOP_WIDTH, EMBED_MIN_WIDTH, EDGE_RAIL_OFFSET_XL_PX } from './utils';
import {
  buildLayoutPresentation,
  useChatSidebarLayoutPresentation,
} from './useChatSidebarDisplayState.helpers';
import { useChatMessageDisplayState } from './useChatSidebarDisplayState.messages';
import { useTabEmbedDisplayState } from './useChatSidebarDisplayState.tabs';

type UseChatSidebarDisplayStateParams = {
  side: 'left' | 'right';
  width: number;
  onWidthChange: (width: number) => void;
  avoidEdgeRail: boolean;
  embedded: boolean;
  fontSize: number;
  activeTab: string;
  primaryMessages: ChatMessage[];
  ircMessagesByChannel: Record<string, ChatMessage[]>;
  primaryChannelLogin: string;
  ircParticipantsByChannelRef: React.MutableRefObject<Record<string, Record<string, IrcParticipant>>>;
  ircParticipantsVersion: number;
  messageOrderReversedByTab: MessageOrderReversedByTab;
  activeChatDisplayMode: 'custom' | 'embed';
  isCollapsed: boolean;
  tabScrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  tabButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  ircChannels: string[];
  channelDisplayNames: Record<string, string>;
  tabDisplayNamesByChannel: Record<string, string>;
  embedReloadNonceByTab: Record<string, number>;
  loadedEmbedTabIds: Record<string, true>;
};

const buildDisplayStateResult = ({
  activeMessages,
  fallbackChatters,
  messageOrderReversed,
  displayedItems,
  popoutChatUrl,
  layout,
  toggleIcon,
  emptyState,
  tabs,
  embedFrames,
  activeEmbedFrame,
}: {
  activeMessages: ChatMessage[];
  fallbackChatters: ChattersPanelChatter[];
  messageOrderReversed: boolean;
  displayedItems: ChatDisplayItem[];
  popoutChatUrl: string;
  layout: ReturnType<typeof buildLayoutPresentation>;
  toggleIcon: React.ReactNode;
  emptyState: React.ReactNode;
  tabs: Array<{ id: string; label: string; title: string; removable: boolean }>;
  embedFrames: Array<{ tabId: string; channelLogin: string; src: string }>;
  activeEmbedFrame: { tabId: string; channelLogin: string; src: string } | null;
}) => ({
  activeMessages,
  fallbackChatters,
  messageOrderReversed,
  displayedItems,
  popoutChatUrl,
  asideClass: layout.asideClass,
  wrapperClass: layout.wrapperClass,
  panelClass: layout.panelClass,
  sidebarStyle: layout.sidebarStyle,
  toggleIcon,
  resizeHandleSideClass: layout.resizeHandleSideClass,
  metaFontSize: layout.metaFontSize,
  translationFontSize: layout.translationFontSize,
  emptyState,
  tabs,
  embedFrames,
  activeEmbedFrame,
});

export const useChatSidebarDisplayState = ({
  side,
  width,
  onWidthChange,
  avoidEdgeRail,
  embedded,
  fontSize,
  activeTab,
  primaryMessages,
  ircMessagesByChannel,
  primaryChannelLogin,
  ircParticipantsByChannelRef,
  ircParticipantsVersion,
  messageOrderReversedByTab,
  activeChatDisplayMode,
  isCollapsed,
  tabScrollerRef,
  tabButtonRefs,
  ircChannels,
  channelDisplayNames,
  tabDisplayNamesByChannel,
  embedReloadNonceByTab,
  loadedEmbedTabIds,
}: UseChatSidebarDisplayStateParams) => {
  const {
    activeMessages,
    fallbackChatters,
    messageOrderReversed,
    displayedItems,
    resolveTabChannelLogin,
    popoutChatUrl,
  } = useChatMessageDisplayState({
    activeTab,
    primaryMessages,
    ircMessagesByChannel,
    primaryChannelLogin,
    ircParticipantsByChannelRef,
    ircParticipantsVersion,
    messageOrderReversedByTab,
  });

  const layout = useChatSidebarLayoutPresentation({
    activeChatDisplayMode,
    width,
    embedMinWidth: EMBED_MIN_WIDTH,
    onWidthChange,
    embedded,
    side,
    avoidEdgeRail,
    isCollapsed,
    collapsedDesktopWidth: COLLAPSED_DESKTOP_WIDTH,
    edgeRailOffsetXlPx: EDGE_RAIL_OFFSET_XL_PX,
    fontSize,
  });

  const collapseIcon = side === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />;
  const toggleIcon = isCollapsed ? <span className="text-xs leading-none">＞</span> : collapseIcon;
  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
      <MessageCircle className="w-5 h-5 mb-2" />
      <span>コメント待機中</span>
    </div>
  ), []);

  const {
    tabs,
    embedFrames,
    activeEmbedFrame,
  } = useTabEmbedDisplayState({
    activeTab,
    ircChannels,
    channelDisplayNames,
    tabDisplayNamesByChannel,
    embedReloadNonceByTab,
    loadedEmbedTabIds,
    resolveTabChannelLogin,
    tabScroller: tabScrollerRef.current,
    activeButton: tabButtonRefs.current[activeTab],
  });

  return buildDisplayStateResult({
    activeMessages,
    fallbackChatters,
    messageOrderReversed,
    displayedItems,
    popoutChatUrl,
    layout,
    toggleIcon,
    emptyState,
    tabs,
    embedFrames,
    activeEmbedFrame,
  });
};
