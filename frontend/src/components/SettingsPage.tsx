import { Bluetooth, Bug, ChevronDown, ExternalLink, FileText, Gift, HardDrive, Layers, Mic, Music, Radio, Settings2, Wifi } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsPage, SettingsPageContext } from '../hooks/useSettingsPage';
import { SystemStatusCard } from './SystemStatusCard';
import { Button } from './ui/button';
import { CollapsibleCard } from './ui/collapsible-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { buildApiUrl } from '../utils/api';

// Import tab components
import { GeneralSettings } from './settings/GeneralSettings';
import { MusicSettings } from './settings/MusicSettings';
import { LogsTab } from './settings/LogsTab';
import { TwitchSettings } from './settings/TwitchSettings';
import { PrinterSettings } from './settings/PrinterSettings';
import { OverlaySettings } from './settings/OverlaySettings';
import { ApiTab } from './settings/ApiTab';
import { CacheSettings } from './settings/CacheSettings';
import { MicTranscriptionSettings } from './settings/MicTranscriptionSettings';
import { ChatSidebar } from './ChatSidebar';
import { MicStatusCard } from './MicStatusCard';
import { readIrcChannels, subscribeIrcChannels, writeIrcChannels } from '../utils/chatChannels';

const SIDEBAR_SIDE_STORAGE_KEY = 'chat_sidebar_side';
const SIDEBAR_WIDTH_STORAGE_KEY = 'chat_sidebar_width';
const SIDEBAR_FONT_SIZE_STORAGE_KEY = 'chat_sidebar_font_size';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_FONT_SIZE = 12;
const SIDEBAR_MAX_FONT_SIZE = 40;
const SIDEBAR_DEFAULT_FONT_SIZE = 14;
const PREVIEW_COLUMN_WIDTH_STORAGE_KEY = 'settings.preview.column.width';
const PREVIEW_COLUMN_MIN_WIDTH = 280;
const PREVIEW_COLUMN_MAX_WIDTH = 760;
const PREVIEW_COLUMN_DEFAULT_WIDTH = 420;
const PREVIEW_MIN_HEIGHT = 120;
const PREVIEW_MAX_HEIGHT = 540;
const FOLLOWED_RAIL_SIDE_STORAGE_KEY = 'settings.followed_channels.side';
const FOLLOWED_RAIL_POLL_INTERVAL_MS = 60_000;
const FOLLOWED_RAIL_WIDTH_PX = 48;

type TwitchStreamPreviewProps = {
  isTwitchConfigured: boolean;
  isAuthenticated: boolean;
  channelLogin: string;
  isLive: boolean;
  viewerCount: number;
};

type CompactPreviewFrameProps = {
  panelId: string;
  channelLogin: string;
  status: React.ReactNode;
  defaultOpen?: boolean;
  canOpenLink?: boolean;
  children: React.ReactNode;
};

const CompactPreviewFrame: React.FC<CompactPreviewFrameProps> = ({
  panelId,
  channelLogin,
  status,
  defaultOpen = false,
  canOpenLink = true,
  children,
}) => {
  const storageKey = `settings.panel.${panelId}`;
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return defaultOpen;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  return (
    <div className="overflow-hidden rounded-md border border-gray-700 bg-gray-900/50">
      <div className={`flex items-center gap-2 px-2 py-1.5 ${open ? 'border-b border-gray-700' : ''}`}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        <span className="font-mono text-xs text-gray-300">channel: {channelLogin || '-'}</span>
        <span className="ml-auto text-xs">{status}</span>
        {canOpenLink && channelLogin && (
          <a
            href={`https://www.twitch.tv/${encodeURIComponent(channelLogin)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
            aria-label={`${channelLogin} を開く`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
};

type ResizablePreviewEmbedProps = {
  panelId: string;
  title: string;
  src: string;
  defaultHeight?: number;
};

const ResizablePreviewEmbed: React.FC<ResizablePreviewEmbedProps> = ({
  panelId,
  title,
  src,
  defaultHeight = 180,
}) => {
  const storageKey = `settings.preview.height.${panelId}`;
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultHeight;
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return defaultHeight;
    return Math.min(PREVIEW_MAX_HEIGHT, Math.max(PREVIEW_MIN_HEIGHT, parsed));
  });
  const [resizing, setResizing] = useState(false);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, String(height));
  }, [height, storageKey]);

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const delta = event.clientY - resizeStateRef.current.startY;
      const nextHeight = Math.min(
        PREVIEW_MAX_HEIGHT,
        Math.max(PREVIEW_MIN_HEIGHT, resizeStateRef.current.startHeight + delta),
      );
      setHeight(nextHeight);
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      setResizing(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStateRef.current = { startY: event.clientY, startHeight: height };
    setResizing(true);
  };

  return (
    <div className="group relative">
      <div className="overflow-hidden rounded-md border border-gray-700 bg-black">
        <iframe
          title={title}
          src={src}
          className="w-full"
          style={{ height: `${height}px` }}
          allow="autoplay; fullscreen"
          scrolling="no"
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="プレビュー高さを調整"
        onPointerDown={handleResizeStart}
        className={`absolute inset-x-2 -bottom-1.5 z-10 h-3 cursor-row-resize touch-none ${
          resizing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
        }`}
      >
        <div className="h-full w-full rounded bg-blue-500/40" />
      </div>
    </div>
  );
};

const TwitchStreamPreview: React.FC<TwitchStreamPreviewProps> = ({
  isTwitchConfigured,
  isAuthenticated,
  channelLogin,
  isLive,
  viewerCount,
}) => {
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const canEmbed = Boolean(channelLogin);
  const playerUrl = canEmbed
    ? `https://player.twitch.tv/?channel=${encodeURIComponent(channelLogin)}&parent=${encodeURIComponent(host)}&autoplay=true&muted=true`
    : '';

  return (
    <CompactPreviewFrame
      panelId="settings.twitch.stream-preview"
      defaultOpen
      channelLogin={channelLogin}
      canOpenLink={canEmbed}
      status={(
        <span className={`inline-flex items-center gap-1 ${isLive ? 'text-red-400' : 'text-gray-400'}`}>
          <Radio className={`h-3.5 w-3.5 ${isLive ? 'animate-pulse' : ''}`} />
          {isLive ? `LIVE (${viewerCount})` : 'OFFLINE'}
        </span>
      )}
    >
      {!isTwitchConfigured && (
        <p className="text-sm text-gray-400">Twitch設定が未完了です。</p>
      )}
      {isTwitchConfigured && !isAuthenticated && (
        <p className="text-sm text-gray-400">Twitch認証後にプレビューを表示します。</p>
      )}
      {isTwitchConfigured && isAuthenticated && !canEmbed && (
        <p className="text-sm text-gray-400">ユーザー情報を検証中です。少し待つか、Twitch設定で再検証してください。</p>
      )}
      {isTwitchConfigured && isAuthenticated && canEmbed && (
        <ResizablePreviewEmbed
          panelId="settings.twitch.stream-preview.main"
          title="Twitch Stream Preview"
          src={playerUrl}
          defaultHeight={180}
        />
      )}
    </CompactPreviewFrame>
  );
};

type AddedChannelStreamPreviewProps = {
  channelLogin: string;
};

const AddedChannelStreamPreview: React.FC<AddedChannelStreamPreviewProps> = ({ channelLogin }) => {
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const playerUrl = `https://player.twitch.tv/?channel=${encodeURIComponent(channelLogin)}&parent=${encodeURIComponent(host)}&autoplay=true&muted=true`;

  return (
    <CompactPreviewFrame
      panelId={`settings.twitch.stream-preview.irc.${channelLogin}`}
      channelLogin={channelLogin}
      defaultOpen={false}
      status={<span className="text-emerald-400">IRC</span>}
    >
      <ResizablePreviewEmbed
        panelId={`settings.twitch.stream-preview.irc.${channelLogin}.embed`}
        title={`Twitch Stream Preview - ${channelLogin}`}
        src={playerUrl}
        defaultHeight={180}
      />
    </CompactPreviewFrame>
  );
};

type FollowedChannelRailItem = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  profile_image_url: string;
  followed_at?: string;
  is_live: boolean;
  viewer_count: number;
  title?: string | null;
  started_at?: string | null;
};

type FollowedChannelsRailProps = {
  side: 'left' | 'right';
  channels: FollowedChannelRailItem[];
  loading: boolean;
  error: string;
  onSideChange: (side: 'left' | 'right') => void;
  onConnectIrc: (channelLogin: string) => void;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
};

const FollowedChannelsRail: React.FC<FollowedChannelsRailProps> = ({
  side,
  channels,
  loading,
  error,
  onSideChange,
  onConnectIrc,
  onStartRaid,
}) => {
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [raidConfirmChannelId, setRaidConfirmChannelId] = useState<string | null>(null);
  const [raidingChannelId, setRaidingChannelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (openChannelId && !channels.some((item) => item.broadcaster_id === openChannelId)) {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
    }
  }, [channels, openChannelId]);

  useEffect(() => {
    if (!openChannelId) {
      setMenuAnchor(null);
      return;
    }

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-followed-menu="true"]')) return;
      if (target.closest('[data-followed-trigger="true"]')) return;
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setActionError('');
    };

    const closeByResize = () => {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setActionError('');
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('resize', closeByResize);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('resize', closeByResize);
    };
  }, [openChannelId]);

  const tooltipSideClass = side === 'left' ? 'left-full ml-2' : 'right-full mr-2';
  const toggleLabel = side === 'left' ? '右側へ移動' : '左側へ移動';

  return (
    <div
      className={`hidden xl:block fixed inset-y-0 z-40 border-gray-700 bg-gray-900 ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'}`}
      style={{ width: `${FOLLOWED_RAIL_WIDTH_PX}px` }}
    >
      <div className="flex h-full flex-col items-center py-2">
        <button
          type="button"
          onClick={() => onSideChange(side === 'left' ? 'right' : 'left')}
          className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <span className="text-xs">{side === 'left' ? '⇢' : '⇠'}</span>
        </button>
        <div className="h-px w-8 bg-gray-700 mb-2" />
        <div className="flex-1 overflow-y-auto space-y-2 px-1">
          {loading && (
            <div className="flex w-full justify-center py-1 text-[10px] text-gray-400">...</div>
          )}
          {!loading && channels.length === 0 && (
            <div className="flex w-full justify-center py-1 text-[10px] text-gray-500">--</div>
          )}
          {channels.map((channel) => {
            const selected = openChannelId === channel.broadcaster_id;
            return (
              <div key={channel.broadcaster_id} className="group relative flex justify-center">
                <button
                  type="button"
                  onClick={(event) => {
                    const nextOpen = openChannelId !== channel.broadcaster_id;
                    setActionError('');
                    setRaidConfirmChannelId(null);
                    setOpenChannelId(nextOpen ? channel.broadcaster_id : null);
                    if (!nextOpen) {
                      setMenuAnchor(null);
                      return;
                    }
                    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    const menuWidth = 192;
                    const menuHeight = 170;
                    const top = Math.max(
                      12,
                      Math.min(window.innerHeight - menuHeight - 12, rect.top + (rect.height / 2) - (menuHeight / 2)),
                    );
                    const left = side === 'left'
                      ? Math.min(window.innerWidth - menuWidth - 12, rect.right + 8)
                      : Math.max(12, rect.left - menuWidth - 8);
                    setMenuAnchor({ top, left });
                  }}
                  className={`relative h-9 w-9 rounded-full border transition ${
                    selected
                      ? 'border-blue-400 ring-1 ring-blue-400/60'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                  aria-label={`${channel.broadcaster_name} の操作を開く`}
                  data-followed-trigger="true"
                >
                  <span className="block h-full w-full overflow-hidden rounded-full">
                    {channel.profile_image_url ? (
                      <img
                        src={channel.profile_image_url}
                        alt={channel.broadcaster_name}
                        className={`h-full w-full object-cover ${channel.is_live ? '' : 'grayscale opacity-70'}`}
                      />
                    ) : (
                      <span className={`flex h-full w-full items-center justify-center bg-gray-700 text-xs font-semibold ${channel.is_live ? 'text-white' : 'text-gray-300'}`}>
                        {(channel.broadcaster_name || channel.broadcaster_login || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  {channel.is_live && (
                    <span className="absolute -right-1 -top-1 z-10 inline-flex h-3.5 w-3.5 rounded-full border border-gray-900 bg-red-500 shadow" />
                  )}
                </button>
                <div
                  className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-100 opacity-0 shadow transition group-hover:opacity-100`}
                >
                  {channel.broadcaster_name}
                  {channel.is_live ? ` (LIVE ${channel.viewer_count})` : ' (OFFLINE)'}
                </div>
                {selected && menuAnchor && (
                  <div
                    data-followed-menu="true"
                    className="fixed z-50 w-48 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl"
                    style={{ left: `${menuAnchor.left}px`, top: `${menuAnchor.top}px` }}
                  >
                    <div className="mb-1 text-xs font-semibold text-gray-100">#{channel.broadcaster_login}</div>
                    <div className="mb-2 text-[11px] text-gray-400 truncate">
                      {channel.title || (channel.is_live ? 'LIVE中' : 'オフライン')}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onConnectIrc(channel.broadcaster_login);
                        setOpenChannelId(null);
                        setMenuAnchor(null);
                        setRaidConfirmChannelId(null);
                      }}
                      className="mb-1 inline-flex h-8 w-full items-center justify-center rounded border border-emerald-600/60 text-xs text-emerald-300 hover:bg-emerald-700/20"
                    >
                      IRC接続
                    </button>
                    <button
                      type="button"
                      disabled={raidingChannelId === channel.broadcaster_id}
                      onClick={async () => {
                        if (raidConfirmChannelId !== channel.broadcaster_id) {
                          setRaidConfirmChannelId(channel.broadcaster_id);
                          setActionError('');
                          return;
                        }
                        setActionError('');
                        setRaidingChannelId(channel.broadcaster_id);
                        try {
                          await onStartRaid(channel);
                          setOpenChannelId(null);
                          setMenuAnchor(null);
                          setRaidConfirmChannelId(null);
                        } catch (error: any) {
                          setActionError(error?.message || 'レイド開始に失敗しました');
                        } finally {
                          setRaidingChannelId(null);
                        }
                      }}
                      className={`inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
                        raidConfirmChannelId === channel.broadcaster_id
                          ? 'border-red-500/80 text-red-200 hover:bg-red-700/20'
                          : 'border-gray-600 text-gray-200 hover:bg-gray-800'
                      } disabled:opacity-60`}
                    >
                      {raidingChannelId === channel.broadcaster_id
                        ? 'レイド中...'
                        : raidConfirmChannelId === channel.broadcaster_id
                          ? 'レイド確定'
                          : 'レイド'}
                    </button>
                    {raidConfirmChannelId === channel.broadcaster_id && (
                      <button
                        type="button"
                        onClick={() => setRaidConfirmChannelId(null)}
                        className="mt-1 inline-flex h-7 w-full items-center justify-center rounded border border-gray-700 text-[11px] text-gray-300 hover:bg-gray-800"
                      >
                        キャンセル
                      </button>
                    )}
                    {actionError && <p className="mt-1 text-[11px] text-red-300">{actionError}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!!error && (
          <div className="mt-2 w-full px-1 text-center text-[10px] leading-tight text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const contextValue = useSettingsPage();
  const autoVerifyTriggeredRef = useRef(false);
  const [ircChannels, setIrcChannels] = useState<string[]>(() => readIrcChannels());
  const [followedRailSide, setFollowedRailSide] = useState<'left' | 'right'>(() => {
    if (typeof window === 'undefined') return 'right';
    const stored = window.localStorage.getItem(FOLLOWED_RAIL_SIDE_STORAGE_KEY);
    return stored === 'left' ? 'left' : 'right';
  });
  const [followedChannels, setFollowedChannels] = useState<FollowedChannelRailItem[]>([]);
  const [followedChannelsLoading, setFollowedChannelsLoading] = useState(false);
  const [followedChannelsError, setFollowedChannelsError] = useState('');
  const [chatSidebarSide, setChatSidebarSide] = useState<'left' | 'right'>(() => {
    if (typeof window === 'undefined') return 'left';
    const stored = window.localStorage.getItem(SIDEBAR_SIDE_STORAGE_KEY);
    return stored === 'right' ? 'right' : 'left';
  });
  const [chatSidebarWidth, setChatSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
  });
  const [chatSidebarFontSize, setChatSidebarFontSize] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_FONT_SIZE;
    const stored = window.localStorage.getItem(SIDEBAR_FONT_SIZE_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_FONT_SIZE;
    return Math.min(SIDEBAR_MAX_FONT_SIZE, Math.max(SIDEBAR_MIN_FONT_SIZE, parsed));
  });
  const [previewColumnWidth, setPreviewColumnWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return PREVIEW_COLUMN_DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(PREVIEW_COLUMN_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return PREVIEW_COLUMN_DEFAULT_WIDTH;
    return Math.min(PREVIEW_COLUMN_MAX_WIDTH, Math.max(PREVIEW_COLUMN_MIN_WIDTH, parsed));
  });
  const [previewColumnResizing, setPreviewColumnResizing] = useState(false);
  const previewResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const {
    activeTab,
    setActiveTab,
    featureStatus,
    authStatus,
    streamStatus,
    twitchUserInfo,
    printerStatusInfo,
    refreshingStreamStatus,
    reconnectingPrinter,
    testingPrinter,
    testingNotification,
    verifyingTwitch,
    webServerPort,
    uploadingFont,
    previewImage,
    previewText,
    setPreviewText,
    fileInputRef,
    getSettingValue,
    getBooleanValue,
    handleSettingChange,
    handleTwitchAuth,
    handleRefreshStreamStatus,
    verifyTwitchConfig,
    handlePrinterReconnect,
    handleTestPrint,
    handleTestNotification,
    handleFontUpload,
			handleDeleteFont,
			handleFontPreview,
    handleOpenPresent,
    handleOpenPresentDebug,
    handleOpenOverlay,
    handleOpenOverlayDebug,
    overlaySettings,
    updateOverlaySettings,
	  } = contextValue;

  const handleChatSidebarSideChange = (side: 'left' | 'right') => {
    setChatSidebarSide(side);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_SIDE_STORAGE_KEY, side);
    }
  };

  const handleChatSidebarWidthChange = (nextWidth: number) => {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth));
    setChatSidebarWidth(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    }
  };

  const handleChatSidebarFontSizeChange = (nextSize: number) => {
    const clamped = Math.min(SIDEBAR_MAX_FONT_SIZE, Math.max(SIDEBAR_MIN_FONT_SIZE, nextSize));
    setChatSidebarFontSize(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_FONT_SIZE_STORAGE_KEY, String(clamped));
    }
  };

  const handlePreviewColumnResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    previewResizeStateRef.current = { startX: event.clientX, startWidth: previewColumnWidth };
    setPreviewColumnResizing(true);
  };

  const connectIrcChannel = (channelLogin: string) => {
    const normalized = (channelLogin || '').trim().toLowerCase();
    if (!normalized) return;
    const current = readIrcChannels();
    if (current.includes(normalized)) return;
    writeIrcChannels([...current, normalized]);
    setIrcChannels(readIrcChannels());
  };

  const startRaidToChannel = async (channel: FollowedChannelRailItem) => {
    const ownChannelLogin = (twitchUserInfo?.login || '').trim().toLowerCase();
    if (!ownChannelLogin) {
      throw new Error('Twitchユーザーが未設定です');
    }

    const response = await fetch(buildApiUrl('/api/chat/post'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: ownChannelLogin,
        message: `/raid ${channel.broadcaster_login}`,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || `HTTP ${response.status}`;
      throw new Error(message);
    }
  };

  const layoutOrders = useMemo(() => {
    return chatSidebarSide === 'left'
      ? { sidebar: 'order-1 lg:order-1', content: 'order-2 lg:order-2' }
      : { sidebar: 'order-1 lg:order-2', content: 'order-2 lg:order-1' };
  }, [chatSidebarSide]);
  const configuredChannelLogin = (twitchUserInfo?.login || '').toLowerCase();
  const extraPreviewChannels = useMemo(
    () => ircChannels.filter((channel) => channel !== configuredChannelLogin),
    [configuredChannelLogin, ircChannels],
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  useEffect(() => {
    const shouldVerify =
      Boolean(featureStatus?.twitch_configured) &&
      Boolean(authStatus?.authenticated) &&
      !twitchUserInfo &&
      !verifyingTwitch;

    if (!shouldVerify) {
      if (!featureStatus?.twitch_configured || !authStatus?.authenticated) {
        autoVerifyTriggeredRef.current = false;
      }
      return;
    }

    if (autoVerifyTriggeredRef.current) {
      return;
    }

    autoVerifyTriggeredRef.current = true;
    void verifyTwitchConfig();
  }, [
    featureStatus?.twitch_configured,
    authStatus?.authenticated,
    twitchUserInfo,
    verifyingTwitch,
    verifyTwitchConfig,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeIrcChannels((channels) => {
      setIrcChannels(channels);
    });
    setIrcChannels(readIrcChannels());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FOLLOWED_RAIL_SIDE_STORAGE_KEY, followedRailSide);
  }, [followedRailSide]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const canFetch = Boolean(featureStatus?.twitch_configured) && Boolean(authStatus?.authenticated);
    if (!canFetch) {
      setFollowedChannels([]);
      setFollowedChannelsError('');
      setFollowedChannelsLoading(false);
      return () => {};
    }

    const loadFollowedChannels = async (showLoading: boolean) => {
      if (showLoading) {
        setFollowedChannelsLoading(true);
      }
      try {
        const response = await fetch(buildApiUrl('/api/twitch/followed-channels?limit=50'));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const data = Array.isArray(payload?.data) ? payload.data : [];
        const normalized: FollowedChannelRailItem[] = data.map((item: any) => ({
          broadcaster_id: String(item.broadcaster_id ?? item.id ?? ''),
          broadcaster_login: String(item.broadcaster_login ?? item.login ?? ''),
          broadcaster_name: String(item.broadcaster_name ?? item.display_name ?? item.login ?? ''),
          profile_image_url: String(item.profile_image_url ?? ''),
          followed_at: typeof item.followed_at === 'string' ? item.followed_at : undefined,
          is_live: Boolean(item.is_live),
          viewer_count: Number(item.viewer_count ?? 0) || 0,
          title: typeof item.title === 'string' ? item.title : undefined,
          started_at: typeof item.started_at === 'string' ? item.started_at : undefined,
        })).filter((item) => item.broadcaster_id && item.broadcaster_login);

        normalized.sort((a, b) => {
          if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
          if (a.viewer_count !== b.viewer_count) return b.viewer_count - a.viewer_count;
          return a.broadcaster_name.localeCompare(b.broadcaster_name, 'ja');
        });
        if (!cancelled) {
          setFollowedChannels(normalized);
          setFollowedChannelsError('');
        }
      } catch (error) {
        if (!cancelled) {
          setFollowedChannelsError('取得失敗');
        }
      } finally {
        if (!cancelled) {
          setFollowedChannelsLoading(false);
        }
      }
    };

    void loadFollowedChannels(true);
    timer = window.setInterval(() => {
      void loadFollowedChannels(false);
    }, FOLLOWED_RAIL_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [authStatus?.authenticated, featureStatus?.twitch_configured]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREVIEW_COLUMN_WIDTH_STORAGE_KEY, String(previewColumnWidth));
  }, [previewColumnWidth]);

  useEffect(() => {
    if (!previewColumnResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!previewResizeStateRef.current) return;
      const delta = previewResizeStateRef.current.startX - event.clientX;
      const nextWidth = Math.min(
        PREVIEW_COLUMN_MAX_WIDTH,
        Math.max(PREVIEW_COLUMN_MIN_WIDTH, previewResizeStateRef.current.startWidth + delta),
      );
      setPreviewColumnWidth(nextWidth);
    };

    const handleUp = () => {
      previewResizeStateRef.current = null;
      setPreviewColumnResizing(false);
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
  }, [previewColumnResizing]);

  return (
    <div className="min-h-screen bg-gray-900 transition-colors" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <FollowedChannelsRail
        side={followedRailSide}
        channels={followedChannels}
        loading={followedChannelsLoading}
        error={followedChannelsError}
        onSideChange={setFollowedRailSide}
        onConnectIrc={connectIrcChannel}
        onStartRaid={startRaidToChannel}
      />
      <div className="w-full px-4 py-6">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className={layoutOrders.sidebar}>
            <ChatSidebar
              side={chatSidebarSide}
              onSideChange={handleChatSidebarSideChange}
              width={chatSidebarWidth}
              onWidthChange={handleChatSidebarWidthChange}
              avoidEdgeRail={followedRailSide === chatSidebarSide}
              fontSize={chatSidebarFontSize}
              onFontSizeChange={handleChatSidebarFontSizeChange}
              translationEnabled={getSettingValue('CHAT_TRANSLATION_ENABLED') !== 'false'}
              onTranslationToggle={(enabled) => handleSettingChange('CHAT_TRANSLATION_ENABLED', enabled)}
              notificationOverwrite={getSettingValue('NOTIFICATION_DISPLAY_MODE') === 'overwrite'}
              onNotificationModeToggle={(enabled) =>
                handleSettingChange('NOTIFICATION_DISPLAY_MODE', enabled ? 'overwrite' : 'queue')}
            />
          </div>
          <div className={`flex-1 min-w-0 ${layoutOrders.content}`}>
            <div className="mb-6 flex flex-col gap-4 xl:flex-row">
              <div className="min-w-0 flex-1">
                <CollapsibleCard
                  panelId="settings.quick-actions"
                  className="mb-4"
                  title={(
                    <span className="flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-gray-400" />
                      クイック操作
                    </span>
                  )}
                >
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline"
                      onClick={handleOpenOverlay}
                      className="flex items-center space-x-1">
                      <Layers className="w-3 h-3" />
                      <span>オーバーレイ表示</span>
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={handleOpenOverlayDebug}
                      className="flex items-center space-x-1">
                      <Layers className="w-3 h-3" />
                      <span>オーバーレイ表示(デバッグ)</span>
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={handleOpenPresent}
                      className="flex items-center space-x-1">
                      <Gift className="w-3 h-3" />
                      <span>プレゼントルーレット</span>
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={handleOpenPresentDebug}
                      className="flex items-center space-x-1">
                      <Gift className="w-3 h-3" />
                      <span>プレゼント(デバッグ)</span>
                    </Button>
                  </div>
                </CollapsibleCard>
                <SystemStatusCard
                  featureStatus={featureStatus}
                  authStatus={authStatus}
                  streamStatus={streamStatus}
                  twitchUserInfo={twitchUserInfo}
                  printerStatusInfo={printerStatusInfo}
                  webServerPort={webServerPort}
                  refreshingStreamStatus={refreshingStreamStatus}
                  reconnectingPrinter={reconnectingPrinter}
                  testingPrinter={testingPrinter}
                  verifyingTwitch={verifyingTwitch}
                  onTwitchAuth={handleTwitchAuth}
                  onRefreshStreamStatus={handleRefreshStreamStatus}
                  onVerifyTwitchConfig={verifyTwitchConfig}
                  onPrinterReconnect={handlePrinterReconnect}
                  onTestPrint={handleTestPrint}
                />
                <MicStatusCard
                  overlaySettings={overlaySettings ?? null}
                  updateOverlaySettings={updateOverlaySettings}
                  webServerPort={webServerPort}
                />
              </div>
              <div
                className="relative shrink-0 xl:w-[var(--preview-column-width)]"
                style={{ '--preview-column-width': `${previewColumnWidth}px` } as React.CSSProperties}
              >
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="プレビューカラム幅を調整"
                  onPointerDown={handlePreviewColumnResizeStart}
                  className="absolute -left-1.5 top-0 hidden h-full w-3 cursor-col-resize touch-none xl:block"
                >
                  <div className="mx-auto h-full w-1 rounded bg-transparent hover:bg-blue-500/30" />
                </div>
                <div className="space-y-4">
                  <TwitchStreamPreview
                    isTwitchConfigured={Boolean(featureStatus?.twitch_configured)}
                    isAuthenticated={Boolean(authStatus?.authenticated)}
                    channelLogin={twitchUserInfo?.login ?? ''}
                    isLive={Boolean(streamStatus?.is_live)}
                    viewerCount={streamStatus?.viewer_count ?? 0}
                  />
                  {extraPreviewChannels.map((channel) => (
                    <AddedChannelStreamPreview key={channel} channelLogin={channel} />
                  ))}
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-9 mb-6">
                <TabsTrigger value="general"><Settings2 className="w-4 h-4 mr-1" />一般</TabsTrigger>
                <TabsTrigger value="mic"><Mic className="w-4 h-4 mr-1" />マイク</TabsTrigger>
                <TabsTrigger value="twitch"><Wifi className="w-4 h-4 mr-1" />Twitch</TabsTrigger>
                <TabsTrigger value="printer"><Bluetooth className="w-4 h-4 mr-1" />プリンター</TabsTrigger>
                <TabsTrigger value="music"><Music className="w-4 h-4 mr-1" />音楽</TabsTrigger>
                <TabsTrigger value="overlay"><Layers className="w-4 h-4 mr-1" />オーバーレイ</TabsTrigger>
                <TabsTrigger value="logs"><FileText className="w-4 h-4 mr-1" />ログ</TabsTrigger>
                <TabsTrigger value="cache"><HardDrive className="w-4 h-4 mr-1" />キャッシュ</TabsTrigger>
                <TabsTrigger value="api"><Bug className="w-4 h-4 mr-1" />API</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <GeneralSettings
                  getSettingValue={getSettingValue}
                  handleSettingChange={handleSettingChange}
                  getBooleanValue={getBooleanValue}
                  streamStatus={streamStatus}
                  fileInputRef={fileInputRef}
                  uploadingFont={uploadingFont}
                  handleFontUpload={handleFontUpload}
                  previewText={previewText}
                  setPreviewText={setPreviewText}
                  previewImage={previewImage}
                  handleFontPreview={handleFontPreview}
                  handleDeleteFont={handleDeleteFont}
                  handleTestNotification={handleTestNotification}
                  testingNotification={testingNotification}
                />
              </TabsContent>
              <TabsContent value="mic">
                <SettingsPageContext.Provider value={contextValue}>
                  <MicTranscriptionSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="twitch">
                <SettingsPageContext.Provider value={contextValue}>
                  <TwitchSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="printer">
                <SettingsPageContext.Provider value={contextValue}>
                  <PrinterSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="music"><MusicSettings /></TabsContent>
              <TabsContent value="overlay">
                <SettingsPageContext.Provider value={contextValue}>
                  <OverlaySettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="logs"><LogsTab /></TabsContent>
              <TabsContent value="cache"><CacheSettings /></TabsContent>
              <TabsContent value="api"><ApiTab /></TabsContent>
            </Tabs>
          </div>

        </div>
      </div>
    </div>
  );
};
