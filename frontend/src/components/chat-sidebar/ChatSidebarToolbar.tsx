import React from 'react';
import {
  ArrowUpDown,
  ExternalLink,
  LocateFixed,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Twitch,
  Users,
} from 'lucide-react';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import type {
  ChatDisplayMode,
  MessageOrderReversedByTab,
} from './types';
import { ChatSidebarSettingsPanel } from './ChatSidebarSettingsPanel';

type ChatSidebarToolbarProps = {
  activeTab: string;
  activeChatDisplayMode: ChatDisplayMode;
  messageOrderReversed: boolean;
  chattersOpen: boolean;
  channelEditorOpen: boolean;
  actionsMenuOpen: boolean;
  settingsOpen: boolean;
  popoutChatUrl: string;
  embedded: boolean;
  isCollapsed: boolean;
  toggleIcon: React.ReactNode;
  fontSize: number;
  translationEnabled: boolean;
  notificationOverwrite: boolean;
  onEnsureIrcPreview?: (channelLogin: string) => void;
  setChannelEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setChannelInputError: React.Dispatch<React.SetStateAction<string>>;
  setMessageOrderReversedByTab: React.Dispatch<React.SetStateAction<MessageOrderReversedByTab>>;
  setChattersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveChatDisplayMode: (mode: ChatDisplayMode) => void;
  setActionsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEmbedReloadNonceByTab: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenChatPopout: () => void;
  onFontSizeChange: (size: number) => void;
  onTranslationToggle: (enabled: boolean) => void;
  onNotificationModeToggle: (enabled: boolean) => void;
  onToggleSidebar: () => void;
  settingsButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  settingsPanelRef: React.MutableRefObject<HTMLDivElement | null>;
  actionsMenuButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  actionsMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
};

export const ChatSidebarToolbar: React.FC<ChatSidebarToolbarProps> = ({
  activeTab,
  activeChatDisplayMode,
  messageOrderReversed,
  chattersOpen,
  channelEditorOpen,
  actionsMenuOpen,
  settingsOpen,
  popoutChatUrl,
  embedded,
  isCollapsed,
  toggleIcon,
  fontSize,
  translationEnabled,
  notificationOverwrite,
  onEnsureIrcPreview,
  setChannelEditorOpen,
  setChannelInputError,
  setMessageOrderReversedByTab,
  setChattersOpen,
  setActiveChatDisplayMode,
  setActionsMenuOpen,
  setEmbedReloadNonceByTab,
  setSettingsOpen,
  onOpenChatPopout,
  onFontSizeChange,
  onTranslationToggle,
  onNotificationModeToggle,
  onToggleSidebar,
  settingsButtonRef,
  settingsPanelRef,
  actionsMenuButtonRef,
  actionsMenuPanelRef,
}) => {
  return (
    <div className="flex items-center border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 relative px-3 py-2 justify-between">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">コメント欄</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setChannelEditorOpen((prev) => !prev);
            setChannelInputError('');
          }}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
          aria-label="IRCチャンネルを追加"
          aria-expanded={channelEditorOpen}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setMessageOrderReversedByTab((prev) => {
              const nextValue = !(prev[activeTab] === true);
              if (nextValue) return { ...prev, [activeTab]: true };
              if (!(activeTab in prev)) return prev;
              const next = { ...prev };
              delete next[activeTab];
              return next;
            });
          }}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition ${
            activeChatDisplayMode === 'embed'
              ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
              : messageOrderReversed
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-500/20 dark:text-blue-100'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800'
          }`}
          aria-label={messageOrderReversed ? 'コメント順を下に最新へ戻す' : 'コメント順を上に最新へ変更する'}
          title={messageOrderReversed ? '上に最新 (ON)' : '下に最新 (OFF)'}
          disabled={activeChatDisplayMode === 'embed'}
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setChattersOpen((prev) => !prev)}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition ${
            activeChatDisplayMode === 'embed'
              ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
              : chattersOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-500/20 dark:text-blue-100'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800'
          }`}
          aria-label="視聴者一覧を開く"
          aria-expanded={chattersOpen}
          title="視聴者一覧"
          disabled={activeChatDisplayMode === 'embed'}
        >
          <Users className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setActiveChatDisplayMode(activeChatDisplayMode === 'custom' ? 'embed' : 'custom')}
          className="inline-flex items-stretch overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
          aria-label={activeChatDisplayMode === 'custom' ? '本家チャット表示へ切り替える' : '独自チャット表示へ切り替える'}
          title={activeChatDisplayMode === 'custom' ? 'Twitch Embedへ切り替え' : '独自チャットへ切り替え'}
        >
          <span
            className={`inline-flex items-center justify-center w-7 h-7 transition ${
              activeChatDisplayMode === 'custom'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-100'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </span>
          <span
            className={`inline-flex items-center justify-center w-7 h-7 border-l border-gray-200 dark:border-gray-700 transition ${
              activeChatDisplayMode === 'embed'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-100'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Twitch className="w-3.5 h-3.5" />
          </span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActionsMenuOpen((prev) => !prev)}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition ${
              actionsMenuOpen
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-500/20 dark:text-blue-100'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800'
            }`}
            aria-label="その他のチャット操作を開く"
            aria-expanded={actionsMenuOpen}
            title="その他"
            ref={actionsMenuButtonRef}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {actionsMenuOpen && (
            <div
              ref={actionsMenuPanelRef}
              className="absolute right-0 top-9 z-20 w-48 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-1"
            >
              <button
                type="button"
                onClick={() => {
                  if (activeChatDisplayMode !== 'embed') return;
                  setEmbedReloadNonceByTab((current) => ({
                    ...current,
                    [activeTab]: (current[activeTab] ?? 0) + 1,
                  }));
                  setActionsMenuOpen(false);
                }}
                className={`w-full inline-flex items-center gap-2 px-2 py-1.5 text-left rounded text-sm transition ${
                  activeChatDisplayMode === 'embed'
                    ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                disabled={activeChatDisplayMode !== 'embed'}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Embed再読み込み</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!popoutChatUrl) return;
                  onOpenChatPopout();
                  setActionsMenuOpen(false);
                }}
                className={`w-full inline-flex items-center gap-2 px-2 py-1.5 text-left rounded text-sm transition ${
                  popoutChatUrl
                    ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                disabled={!popoutChatUrl}
              >
                <ExternalLink className="w-4 h-4" />
                <span>ポップアウトで開く</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeTab === PRIMARY_CHAT_TAB_ID) return;
                  onEnsureIrcPreview?.(activeTab);
                  setActionsMenuOpen(false);
                }}
                className={`w-full inline-flex items-center gap-2 px-2 py-1.5 text-left rounded text-sm transition ${
                  activeTab === PRIMARY_CHAT_TAB_ID
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                disabled={activeTab === PRIMARY_CHAT_TAB_ID}
              >
                <LocateFixed className="w-4 h-4" />
                <span>プレビューへ移動</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
          aria-label="コメント欄の設定を開く"
          aria-expanded={settingsOpen}
          ref={settingsButtonRef}
        >
          <Settings className="w-4 h-4" />
        </button>

        {!embedded && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
            aria-label="コメント欄を閉じる"
            aria-expanded={!isCollapsed}
          >
            {toggleIcon}
          </button>
        )}
      </div>

      {settingsOpen && (
        <ChatSidebarSettingsPanel
          fontSize={fontSize}
          translationEnabled={translationEnabled}
          notificationOverwrite={notificationOverwrite}
          onFontSizeChange={onFontSizeChange}
          onTranslationToggle={onTranslationToggle}
          onNotificationModeToggle={onNotificationModeToggle}
          settingsPanelRef={settingsPanelRef}
        />
      )}
    </div>
  );
};
