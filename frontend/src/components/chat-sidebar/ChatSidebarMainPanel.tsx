import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronsDown, ChevronsUp, MessageCircle, Send } from 'lucide-react';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import type { ChatMessage } from '../ChatSidebarItem';
import { ChatSidebarItem } from '../ChatSidebarItem';
import { EmotePicker } from '../chat/EmotePicker';
import { RichChatInput, type RichChatInputRef } from '../chat/RichChatInput';
import { Button } from '../ui/button';
import { formatTime } from './utils';
import type { BadgeVisual, ChatDisplayItem } from './types';

export const ChatSidebarMainPanel: React.FC<{
  isCollapsed: boolean;
  onToggleSidebar: () => void;
  activeChatDisplayMode: 'custom' | 'embed';
  messageOrderReversed: boolean;
  embedFrames: Array<{ tabId: string; channelLogin: string; src: string }>;
  activeTab: string;
  activeEmbedFrame: { tabId: string; channelLogin: string; src: string } | null;
  listRef: React.MutableRefObject<HTMLDivElement | null>;
  activeMessages: ChatMessage[];
  emptyState: React.ReactNode;
  displayedItems: ChatDisplayItem[];
  fontSize: number;
  metaFontSize: number;
  translationFontSize: number;
  onOpenUserInfo: (message: ChatMessage) => void;
  onOpenRawData: (message: ChatMessage) => void;
  resolveBadgeVisual: (badgeKey: string) => BadgeVisual | null;
  richInputRef: React.MutableRefObject<RichChatInputRef | null>;
  postingMessage: boolean;
  isPrimaryTab: boolean;
  primaryChannelLogin: string;
  activeBadgeChannelLogin: string;
  postError: string;
  setPostError: React.Dispatch<React.SetStateAction<string>>;
  setInputHasContent: React.Dispatch<React.SetStateAction<boolean>>;
  sendComment: () => Promise<void>;
  inputHasContent: boolean;
}> = ({
  isCollapsed,
  onToggleSidebar,
  activeChatDisplayMode,
  messageOrderReversed,
  embedFrames,
  activeTab,
  activeEmbedFrame,
  listRef,
  activeMessages,
  emptyState,
  displayedItems,
  fontSize,
  metaFontSize,
  translationFontSize,
  onOpenUserInfo,
  onOpenRawData,
  resolveBadgeVisual,
  richInputRef,
  postingMessage,
  isPrimaryTab,
  primaryChannelLogin,
  activeBadgeChannelLogin,
  postError,
  setPostError,
  setInputHasContent,
  sendComment,
  inputHasContent,
}) => {
  const [autoFollowLatest, setAutoFollowLatest] = useState(true);
  const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());
  const isNearLatestPosition = useCallback((element: HTMLDivElement) => {
    const threshold = 20;
    if (messageOrderReversed) return element.scrollTop <= threshold;
    const distance = element.scrollHeight - element.clientHeight - element.scrollTop;
    return distance <= threshold;
  }, [messageOrderReversed]);
  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = listRef.current;
    if (!element) return;
    if (messageOrderReversed) {
      element.scrollTo({ top: 0, behavior });
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, [listRef, messageOrderReversed]);
  const handleListScroll = useCallback(() => {
    const element = listRef.current;
    if (!element) return;
    const atLatest = isNearLatestPosition(element);
    setAutoFollowLatest((current) => (current === atLatest ? current : atLatest));
  }, [isNearLatestPosition, listRef]);
  const handleJumpToLatest = useCallback(() => {
    setAutoFollowLatest(true);
    scrollToLatest('smooth');
  }, [scrollToLatest]);
  const hasSecondPrecisionTimestamp = useMemo(() => {
    for (const message of activeMessages) {
      if (!message.timestamp) continue;
      const parsed = new Date(message.timestamp).getTime();
      if (Number.isNaN(parsed)) continue;
      const diffMs = relativeNowMs - parsed;
      if (diffMs >= 0 && diffMs < 60 * 1000) return true;
    }
    return false;
  }, [activeMessages, relativeNowMs]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    setRelativeNowMs(Date.now());
    if (activeMessages.length === 0) return undefined;

    const intervalMs = hasSecondPrecisionTimestamp ? 1000 : 60 * 1000;
    const timer = window.setInterval(() => {
      setRelativeNowMs(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeMessages, activeTab, hasSecondPrecisionTimestamp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAutoFollowLatest(true);
    window.requestAnimationFrame(() => {
      scrollToLatest('auto');
    });
  }, [activeTab, messageOrderReversed, scrollToLatest]);

  useEffect(() => {
    if (!autoFollowLatest) return;
    scrollToLatest('auto');
  }, [activeMessages, autoFollowLatest, scrollToLatest]);

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        aria-label="コメント欄を開く"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-[10px] leading-none">開く</span>
      </button>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        className={`absolute inset-0 min-h-0 border-t dark:border-gray-700 bg-black/10 dark:bg-black/30 transition-opacity ${
          activeChatDisplayMode === 'embed' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {embedFrames.map((frame) => {
          const isVisible = activeChatDisplayMode === 'embed' && frame.tabId === activeTab;
          return (
            <iframe
              key={frame.tabId}
              src={frame.src}
              title={`${frame.channelLogin} のTwitchチャット`}
              className={`absolute inset-0 h-full w-full border-0 transition-opacity ${
                isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              allow="autoplay; clipboard-read; clipboard-write"
            />
          );
        })}
        {embedFrames.length === 0 && (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
            チャンネルログイン名が未解決です。Twitch認証状態を確認してください。
          </div>
        )}
        {embedFrames.length > 0 && !activeEmbedFrame && (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
            このタブのEmbedチャットはまだ準備できていません。
          </div>
        )}
      </div>

      <div
        className={`absolute inset-0 flex flex-col min-h-0 transition-opacity ${
          activeChatDisplayMode === 'custom' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto px-0 pb-0 divide-y divide-gray-200/70 dark:divide-gray-700/70 text-left"
        >
          {activeMessages.length === 0 ? (
            emptyState
          ) : (
            displayedItems.map((item) => (
              item.type === 'date-separator' ? (
                <div
                  key={item.key}
                  className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-gray-600 dark:text-gray-300 bg-gray-100/95 dark:bg-gray-800/95 border-y border-gray-200/80 dark:border-gray-700/80 backdrop-blur-[1px]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                </div>
              ) : (
                <ChatSidebarItem
                  key={item.key}
                  message={item.message}
                  index={item.index}
                  fontSize={fontSize}
                  metaFontSize={metaFontSize}
                  translationFontSize={translationFontSize}
                  timestampLabel={formatTime(item.message.timestamp, relativeNowMs)}
                  onUsernameClick={onOpenUserInfo}
                  onRawDataClick={onOpenRawData}
                  resolveBadgeVisual={resolveBadgeVisual}
                />
              )
            ))
          )}
        </div>
        {!autoFollowLatest && activeMessages.length > 0 && (
          <div className="pointer-events-none absolute bottom-16 right-3 z-20">
            <button
              type="button"
              onClick={handleJumpToLatest}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-400/40 dark:bg-gray-900/95 dark:text-blue-200 dark:hover:bg-gray-800/95 dark:focus-visible:ring-blue-500"
            >
              {messageOrderReversed
                ? <ChevronsUp className="h-3.5 w-3.5" aria-hidden="true" />
                : <ChevronsDown className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{messageOrderReversed ? '一番上へ' : '一番下へ'}</span>
            </button>
          </div>
        )}

        <div className="border-t dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/70">
          <div className="flex items-center gap-2">
            <RichChatInput
              ref={richInputRef}
              placeholder={isPrimaryTab
                ? (primaryChannelLogin ? `#${primaryChannelLogin} に送信...` : 'メインチャンネルに送信...')
                : `#${activeTab} に送信...`}
              disabled={postingMessage}
              rightAccessory={(
                <EmotePicker
                  disabled={postingMessage}
                  triggerVariant="ghost"
                  triggerClassName="h-7 w-7 px-0 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
                  channelLogins={activeBadgeChannelLogin ? [activeBadgeChannelLogin] : []}
                  priorityChannelLogin={activeBadgeChannelLogin || undefined}
                  onSelect={(name, url) => {
                    richInputRef.current?.insertEmote(name, url);
                    richInputRef.current?.focus();
                    if (postError) setPostError('');
                  }}
                />
              )}
              onSubmit={() => void sendComment()}
              onChangeHasContent={setInputHasContent}
              onChangeText={() => {
                if (postError) setPostError('');
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-9 w-9 px-0"
              aria-label="コメントを投稿"
              onClick={() => void sendComment()}
              disabled={postingMessage || !inputHasContent}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          {postError && <p className="mt-1 text-[11px] text-red-500 dark:text-red-300">{postError}</p>}
        </div>
      </div>
    </div>
  );
};
