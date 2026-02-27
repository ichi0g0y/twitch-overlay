import React, { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MAX_IRC_CHANNELS, PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import { Button } from '../ui/button';

type SidebarTab = {
  id: string;
  label: string;
  title: string;
  removable: boolean;
};
type DropPosition = 'before' | 'after';

export const ChatSidebarTabs: React.FC<{
  tabScrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  tabButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  tabs: SidebarTab[];
  activeTab: string;
  connectingChannels: Record<string, boolean>;
  channelEditorOpen: boolean;
  channelInput: string;
  channelInputError: string;
  setActiveTab: (tabId: string) => void;
  setIrcChannels: React.Dispatch<React.SetStateAction<string[]>>;
  handleRemoveChannel: (channel: string) => void;
  setChannelInput: React.Dispatch<React.SetStateAction<string>>;
  setChannelInputError: React.Dispatch<React.SetStateAction<string>>;
  handleAddChannel: () => void;
}> = ({
  tabScrollerRef,
  tabButtonRefs,
  tabs,
  activeTab,
  connectingChannels,
  channelEditorOpen,
  channelInput,
  channelInputError,
  setActiveTab,
  setIrcChannels,
  handleRemoveChannel,
  setChannelInput,
  setChannelInputError,
  handleAddChannel,
}) => {
  const ircChannelCount = tabs.filter((tab) => tab.id !== PRIMARY_CHAT_TAB_ID).length;
  const canAddChannel = ircChannelCount < MAX_IRC_CHANNELS;
  const addChannelLimitMessage = `IRCチャンネルの上限は${MAX_IRC_CHANNELS}件までです`;
  const [dragPlaceholder, setDragPlaceholder] = useState<{
    tabId: string;
    position: DropPosition;
    width: number;
  } | null>(null);
  const draggingTabIdRef = useRef<string | null>(null);
  const draggedTabWidthRef = useRef<number>(88);

  const scrollTabIntoView = useCallback((tabId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        tabButtonRefs.current[tabId]?.scrollIntoView({
          block: 'nearest',
          inline: 'center',
          behavior: 'smooth',
        });
      });
    });
  }, [tabButtonRefs]);

  const reorderIrcChannels = useCallback((sourceId: string, targetId: string, position: DropPosition) => {
    if (!sourceId || !targetId) return;
    if (sourceId === PRIMARY_CHAT_TAB_ID || targetId === PRIMARY_CHAT_TAB_ID) return;

    setIrcChannels((prev) => {
      const sourceIndex = prev.indexOf(sourceId);
      const targetIndex = prev.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      let insertIndex = targetIndex + (position === 'after' ? 1 : 0);
      if (sourceIndex === targetIndex || sourceIndex + 1 === insertIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return prev;
      if (sourceIndex < insertIndex) {
        insertIndex -= 1;
      }
      next.splice(insertIndex, 0, moved);
      if (next.every((item, index) => item === prev[index])) return prev;
      return next;
    });
  }, [setIrcChannels]);

  const finalizeDrop = useCallback((sourceIdMaybe: string | null | undefined) => {
    const sourceId = sourceIdMaybe?.trim();
    const placeholder = dragPlaceholder;
    draggingTabIdRef.current = null;
    setDragPlaceholder(null);
    if (!sourceId || !placeholder) return;
    reorderIrcChannels(sourceId, placeholder.tabId, placeholder.position);
    scrollTabIntoView(sourceId);
  }, [dragPlaceholder, reorderIrcChannels, scrollTabIntoView]);

  const renderPlaceholder = (key: string, width: number) => (
    <div
      key={key}
      className="pointer-events-none h-7 shrink-0 rounded-md border border-dashed border-blue-400/80 bg-blue-100/50 dark:border-blue-400/70 dark:bg-blue-500/10"
      style={{ width: Math.max(58, Math.round(width)) }}
      aria-hidden
    />
  );

  const renderedTabs: React.ReactNode[] = [];
  for (const tab of tabs) {
    const showBeforePlaceholder =
      dragPlaceholder?.tabId === tab.id && dragPlaceholder.position === 'before';
    const showAfterPlaceholder =
      dragPlaceholder?.tabId === tab.id && dragPlaceholder.position === 'after';
    if (showBeforePlaceholder) {
      renderedTabs.push(
        renderPlaceholder(`placeholder-before-${tab.id}`, dragPlaceholder?.width ?? 88),
      );
    }

    const isActive = tab.id === activeTab;
    const isConnecting = tab.id !== PRIMARY_CHAT_TAB_ID && connectingChannels[tab.id];
    renderedTabs.push(
      <button
        key={tab.id}
        type="button"
        draggable={tab.removable}
        onClick={() => setActiveTab(tab.id)}
        onDragStart={(event) => {
          if (!tab.removable) return;
          draggingTabIdRef.current = tab.id;
          draggedTabWidthRef.current = event.currentTarget.offsetWidth;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', tab.id);
        }}
        onDragOver={(event) => {
          if (!tab.removable) return;
          const sourceId = draggingTabIdRef.current;
          if (!sourceId || sourceId === tab.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          const position: DropPosition =
            event.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
          const width = draggedTabWidthRef.current || rect.width || 88;
          const same =
            dragPlaceholder?.tabId === tab.id &&
            dragPlaceholder.position === position &&
            Math.round((dragPlaceholder.width ?? 0)) === Math.round(width);
          if (same) return;
          setDragPlaceholder({ tabId: tab.id, position, width });
        }}
        onDrop={(event) => {
          if (!tab.removable) return;
          event.preventDefault();
          event.stopPropagation();
          finalizeDrop(draggingTabIdRef.current || event.dataTransfer.getData('text/plain'));
        }}
        onDragEnd={() => {
          draggingTabIdRef.current = null;
          setDragPlaceholder(null);
        }}
        title={tab.title}
        ref={(node) => {
          tabButtonRefs.current[tab.id] = node;
        }}
        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs whitespace-nowrap transition ${
          isActive
            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-100'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
      >
        {tab.id !== PRIMARY_CHAT_TAB_ID && (
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
        )}
        <span>{tab.label}</span>
        {tab.removable && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              handleRemoveChannel(tab.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                handleRemoveChannel(tab.id);
              }
            }}
            className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-gray-600"
            aria-label={`#${tab.id} を削除`}
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>,
    );

    if (showAfterPlaceholder) {
      renderedTabs.push(
        renderPlaceholder(`placeholder-after-${tab.id}`, dragPlaceholder?.width ?? 88),
      );
    }
  }

  return (
    <div className="border-b dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 py-1">
      <div
        ref={tabScrollerRef}
        className="flex min-w-0 items-center gap-1 overflow-x-auto px-2 scroll-px-2"
        onDragOver={(event) => {
          if (!draggingTabIdRef.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          if (!draggingTabIdRef.current) return;
          event.preventDefault();
          finalizeDrop(draggingTabIdRef.current || event.dataTransfer.getData('text/plain'));
        }}
      >
        {renderedTabs}
      </div>

      {channelEditorOpen && (
        <div className="mx-2 mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(event) => {
                setChannelInput(event.target.value);
                if (channelInputError) {
                  setChannelInputError('');
                }
              }}
              onKeyDown={(event) => {
                if (!canAddChannel) return;
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  handleAddChannel();
                }
              }}
              placeholder="追加するチャンネル名"
              className="flex-1 h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-2"
              onClick={handleAddChannel}
              disabled={!canAddChannel}
              title={!canAddChannel ? addChannelLimitMessage : undefined}
            >
              追加
            </Button>
          </div>
          {channelInputError && <p className="mt-1 text-[11px] text-red-500">{channelInputError}</p>}
          {!canAddChannel && !channelInputError && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{addChannelLimitMessage}</p>
          )}
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Twitch認証が有効ならユーザー接続し、利用できない場合は匿名接続します
          </p>
        </div>
      )}
    </div>
  );
};
