import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, Settings } from 'lucide-react';
import { buildApiUrlAsync } from '../utils/api';
import { getWebSocketClient } from '../utils/websocket';
import { ChatMessage, ChatSidebarItem } from './ChatSidebarItem';
import { Switch } from './ui/switch';

type SidebarSide = 'left' | 'right';

type ChatSidebarProps = {
  side: SidebarSide;
  onSideChange: (side: SidebarSide) => void;
  width: number;
  onWidthChange: (width: number) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  translationEnabled: boolean;
  onTranslationToggle: (enabled: boolean) => void;
};

const HISTORY_DAYS = 7;
const COLLAPSE_STORAGE_KEY = 'chat_sidebar_collapsed';
const RESIZE_MIN_WIDTH = 220;
const RESIZE_MAX_WIDTH = 520;
const FONT_MIN_SIZE = 12;
const FONT_MAX_SIZE = 40;

const formatTime = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  side,
  onSideChange,
  width,
  onWidthChange,
  fontSize,
  onFontSizeChange,
  translationEnabled,
  onTranslationToggle,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  const trimMessagesByAge = (items: ChatMessage[]) => {
    const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
    return items.filter((msg) => {
      if (!msg.timestamp) return true;
      const parsed = new Date(msg.timestamp).getTime();
      if (Number.isNaN(parsed)) return true;
      return parsed >= cutoff;
    });
  };

  const dedupeMessages = (items: ChatMessage[]) => {
    const nextSet = new Set<string>();
    const next: ChatMessage[] = [];
    for (const item of items) {
      if (item.messageId) {
        if (nextSet.has(item.messageId)) {
          continue;
        }
        nextSet.add(item.messageId);
      }
      next.push(item);
    }
    return next;
  };

  const handleToggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    event.preventDefault();
    resizeStateRef.current = { startX: event.clientX, startWidth: width };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const delta = event.clientX - resizeStateRef.current.startX;
      const direction = side === 'left' ? 1 : -1;
      const nextWidth = Math.min(
        RESIZE_MAX_WIDTH,
        Math.max(RESIZE_MIN_WIDTH, resizeStateRef.current.startWidth + delta * direction),
      );
      onWidthChange(nextWidth);
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      setResizing(false);
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
  }, [onWidthChange, resizing, side]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [settingsOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const url = await buildApiUrlAsync(`/api/chat/history?days=${HISTORY_DAYS}`);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          const rawMessages = Array.isArray(payload) ? payload : payload?.messages;
          if (!Array.isArray(rawMessages)) {
            throw new Error('Invalid history payload');
          }

          const history: ChatMessage[] = rawMessages.map((item: any) => ({
            id: item.id ? String(item.id) : `${item.timestamp || Date.now()}-${Math.random().toString(36).slice(2)}`,
            messageId: item.messageId,
            userId: item.userId,
            username: item.username,
            message: item.message,
            fragments: item.fragments,
            avatarUrl: item.avatarUrl,
            translation: item.translation,
            translationStatus: item.translationStatus,
            translationLang: item.translationLang,
            timestamp: item.timestamp,
          }));

          if (!cancelled) {
            setMessages(dedupeMessages(trimMessagesByAge(history)));
          }
          return;
        } catch (error) {
          if (attempt === maxAttempts || cancelled) {
            console.error('[ChatSidebar] Failed to load history:', error);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const wsClient = getWebSocketClient();

    const setup = async () => {
      try {
        await wsClient.connect();
        const messageUnsubscribe = wsClient.on('chat-message', (data: any) => {
          if (!data || !data.username || !data.message) return;
          const nextMessage: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            messageId: data.messageId,
            userId: data.userId,
            username: data.username,
            message: data.message,
            fragments: data.fragments,
            avatarUrl: data.avatarUrl,
            translation: data.translation,
            translationStatus: data.translationStatus,
            translationLang: data.translationLang,
            timestamp: data.timestamp,
          };
          setMessages(prev => {
            const next = [...prev, nextMessage];
            return dedupeMessages(trimMessagesByAge(next));
          });
        });

        const translationUnsubscribe = wsClient.on('chat-translation', (data: any) => {
          if (!data || !data.messageId) return;
          setMessages(prev => prev.map((msg) => (
            msg.messageId === data.messageId
              ? { ...msg, translation: data.translation, translationStatus: data.translationStatus, translationLang: data.translationLang }
              : msg
          )));
        });

        unsubscribe = () => {
          messageUnsubscribe?.();
          translationUnsubscribe?.();
        };
      } catch (error) {
        console.error('[ChatSidebar] Failed to setup WebSocket:', error);
      }
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const container = listRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, collapsed]);

  const sidebarWidthClass = collapsed ? 'w-full lg:w-12' : 'w-full lg:w-[var(--chat-sidebar-width)]';
  const collapseIcon = side === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />;
  const expandIcon = <span className="text-xs leading-none">＞</span>;
  const toggleIcon = collapsed ? expandIcon : collapseIcon;
  const resizeHandleSideClass = side === 'left' ? 'right-0' : 'left-0';
  const metaFontSize = Math.max(10, fontSize - 2);
  const translationFontSize = Math.max(10, fontSize - 2);
  const sidebarStyle = useMemo(() => ({
    '--chat-sidebar-width': `${width}px`,
  } as React.CSSProperties), [width]);

  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
      <MessageCircle className="w-5 h-5 mb-2" />
      <span>コメント待機中</span>
    </div>
  ), []);

  return (
    <aside className={`transition-all duration-200 ${sidebarWidthClass}`} style={sidebarStyle}>
      <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-140px)] h-80 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm flex flex-col overflow-hidden relative">
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="コメント欄の幅を調整"
            onPointerDown={handleResizeStart}
            className={`absolute top-0 ${resizeHandleSideClass} h-full w-1 cursor-col-resize touch-none`}
          >
            <div className="h-full w-full bg-transparent hover:bg-blue-200/40 dark:hover:bg-blue-500/30 transition-colors" />
          </div>
        )}
        <div
          className={`flex items-center border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 relative ${
            collapsed ? 'px-2 py-1 justify-center' : 'px-3 py-2 justify-between'
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">コメント欄</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {!collapsed && (
              <button
                type="button"
                onClick={() => setSettingsOpen(prev => !prev)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
                aria-label="コメント欄の設定を開く"
                aria-expanded={settingsOpen}
                ref={settingsButtonRef}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleToggle}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition"
              aria-label={collapsed ? 'コメント欄を開く' : 'コメント欄を閉じる'}
              aria-expanded={!collapsed}
            >
              {toggleIcon}
            </button>
          </div>
          {settingsOpen && (
            <div
              ref={settingsPanelRef}
              className="absolute right-2 top-10 z-20 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-sm"
            >
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">文字サイズ</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={FONT_MIN_SIZE}
                      max={FONT_MAX_SIZE}
                      value={fontSize}
                      onChange={(event) => onFontSizeChange(Number(event.target.value))}
                      className="flex-1"
                    />
                    <span className="w-8 text-right text-xs text-gray-600 dark:text-gray-300">{fontSize}px</span>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">配置</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSideChange('left')}
                      className={`h-8 rounded-md border text-xs transition ${
                        side === 'left'
                          ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-200'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      左
                    </button>
                    <button
                      type="button"
                      onClick={() => onSideChange('right')}
                      className={`h-8 rounded-md border text-xs transition ${
                        side === 'right'
                          ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-200'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      右
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">翻訳</div>
                  <Switch checked={translationEnabled} onCheckedChange={onTranslationToggle} />
                </div>
              </div>
            </div>
          )}
        </div>

        {collapsed ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              type="button"
              onClick={handleToggle}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
              aria-label="コメント欄を開く"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-[10px] leading-none">開く</span>
            </button>
          </div>
        ) : (
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-0 py-2 divide-y divide-gray-200/70 dark:divide-gray-700/70 text-left"
          >
            {messages.length === 0 ? (
              emptyState
            ) : (
              messages.map((msg, index) => (
                <ChatSidebarItem
                  key={msg.id}
                  message={msg}
                  index={index}
                  fontSize={fontSize}
                  metaFontSize={metaFontSize}
                  translationFontSize={translationFontSize}
                  timestampLabel={formatTime(msg.timestamp)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
