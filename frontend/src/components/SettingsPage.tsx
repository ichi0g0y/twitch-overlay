import { AlertTriangle, Bluetooth, Bug, ChevronDown, ExternalLink, FileText, Gift, HardDrive, Languages, Layers, Menu, Mic, Music, Radio, RefreshCw, Server, Settings2, Wifi } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import { useSettingsPage, SettingsPageContext } from '../hooks/useSettingsPage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { buildApiUrl } from '../utils/api';
import { useMicCaptionStatus } from '../contexts/MicCaptionStatusContext';
import type { AuthStatus, FeatureStatus, PrinterStatusInfo, StreamStatus, TwitchUserInfo } from '../types';
import type { OverlaySettings as OverlaySettingsState } from '../contexts/SettingsContext';
import { Switch } from './ui/switch';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

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
import { MicCaptionSender } from './mic/MicCaptionSender';
import { readIrcChannels, subscribeIrcChannels, writeIrcChannels } from '../utils/chatChannels';

const SIDEBAR_WIDTH_STORAGE_KEY = 'chat_sidebar_width';
const SIDEBAR_FONT_SIZE_STORAGE_KEY = 'chat_sidebar_font_size';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_FONT_SIZE = 12;
const SIDEBAR_MAX_FONT_SIZE = 40;
const SIDEBAR_DEFAULT_FONT_SIZE = 14;
const PREVIEW_GRID_LAYOUT_STORAGE_KEY = 'settings.preview.grid.layout.v1';
const PREVIEW_AREA_HEIGHT_STORAGE_KEY = 'settings.preview.area.height.v1';
const PREVIEW_AREA_MIN_HEIGHT = 160;
const PREVIEW_AREA_MAX_HEIGHT = 1200;
const PREVIEW_AREA_DEFAULT_HEIGHT = 380;
const LEGACY_PREVIEW_GRID_COLS = 12;
const PREVIOUS_PREVIEW_GRID_COLS = 72;
const PREVIOUS_PREVIEW_GRID_COLS_V2 = 120;
const PREVIOUS_PREVIEW_GRID_COLS_V3 = 240;
const PREVIOUS_PREVIEW_GRID_COLS_V4 = 80;
const PREVIEW_GRID_COLS = 160;
const PREVIEW_GRID_COL_RATIO = PREVIEW_GRID_COLS / LEGACY_PREVIEW_GRID_COLS;
const PREVIEW_GRID_MIN_W = 1;
const PREVIEW_GRID_MIN_H = 1;
const PREVIEW_GRID_MAX_H = 120;
const PREVIEW_GRID_ROW_HEIGHT = 8;
const PREVIEW_GRID_MARGIN: [number, number] = [0, 0];
const FOLLOWED_RAIL_SIDE_STORAGE_KEY = 'settings.followed_channels.side';
const FOLLOWED_RAIL_POLL_INTERVAL_MS = 60_000;
const FOLLOWED_RAIL_WIDTH_PX = 48;

const truncateText = (input: string, max = 80) => {
  const normalized = (input || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
};

type PreviewGridCard = {
  id: string;
  node: React.ReactNode;
  defaultW?: number;
  defaultH?: number;
  minW?: number;
  minH?: number;
};

type LegacyPreviewGridLayoutEntry = {
  order: number;
  colSpan: number;
};

type StoredPreviewGridLayoutPayload = {
  cols?: number;
  layout?: Array<Partial<Layout>>;
};

const toFiniteInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
};

const clampPreviewAreaHeight = (value: number) =>
  Math.min(PREVIEW_AREA_MAX_HEIGHT, Math.max(PREVIEW_AREA_MIN_HEIGHT, value));

const clampPreviewWidth = (value: number, min: number = PREVIEW_GRID_MIN_W) => {
  const normalizedMin = Math.min(PREVIEW_GRID_COLS, Math.max(1, min));
  if (!Number.isFinite(value)) return normalizedMin;
  return Math.min(PREVIEW_GRID_COLS, Math.max(normalizedMin, Math.round(value)));
};

const clampPreviewHeight = (value: number, min: number = PREVIEW_GRID_MIN_H) => {
  const normalizedMin = Math.min(PREVIEW_GRID_MAX_H, Math.max(1, min));
  if (!Number.isFinite(value)) return normalizedMin;
  return Math.min(PREVIEW_GRID_MAX_H, Math.max(normalizedMin, Math.round(value)));
};

const scaleLayoutColumns = (
  layout: Array<Partial<Layout>>,
  fromCols: number,
  toCols: number,
): Array<Partial<Layout>> => {
  if (fromCols <= 0 || fromCols === toCols) return layout;
  const ratio = toCols / fromCols;
  return layout.map((item) => {
    const next: Partial<Layout> = { ...item };
    if (typeof next.x !== 'undefined') next.x = toFiniteInt(next.x, 0) * ratio;
    if (typeof next.w !== 'undefined') next.w = toFiniteInt(next.w, 0) * ratio;
    if (typeof next.minW !== 'undefined') next.minW = toFiniteInt(next.minW, 0) * ratio;
    if (typeof next.maxW !== 'undefined') next.maxW = toFiniteInt(next.maxW, 0) * ratio;
    return next;
  });
};

const scalePreviewLayoutRows = (
  layout: Array<Partial<Layout>>,
  ratio: number,
): Array<Partial<Layout>> =>
  layout.map((item) => ({
    ...item,
    y: typeof item.y !== 'undefined' ? Math.round(toFiniteInt(item.y, 0) * ratio) : item.y,
    h: typeof item.h !== 'undefined'
      ? Math.max(PREVIEW_GRID_MIN_H, Math.round(toFiniteInt(item.h, PREVIEW_GRID_MIN_H) * ratio))
      : item.h,
    minH: typeof item.minH !== 'undefined'
      ? Math.max(PREVIEW_GRID_MIN_H, Math.round(toFiniteInt(item.minH, PREVIEW_GRID_MIN_H) * ratio))
      : item.minH,
    maxH: typeof item.maxH !== 'undefined'
      ? Math.max(PREVIEW_GRID_MIN_H, Math.round(toFiniteInt(item.maxH, PREVIEW_GRID_MAX_H) * ratio))
      : item.maxH,
  }));

const inferStoredLayoutCols = (layout: Array<Partial<Layout>>): number => {
  const maxW = layout.reduce((acc, item) => Math.max(acc, toFiniteInt(item?.w, 0)), 0);
  if (maxW <= LEGACY_PREVIEW_GRID_COLS) return LEGACY_PREVIEW_GRID_COLS;
  if (maxW <= PREVIOUS_PREVIEW_GRID_COLS) return PREVIOUS_PREVIEW_GRID_COLS;
  if (maxW <= PREVIOUS_PREVIEW_GRID_COLS_V4) return PREVIOUS_PREVIEW_GRID_COLS_V4;
  if (maxW <= PREVIOUS_PREVIEW_GRID_COLS_V2) return PREVIOUS_PREVIEW_GRID_COLS_V2;
  if (maxW <= PREVIEW_GRID_COLS) return PREVIEW_GRID_COLS;
  if (maxW <= PREVIOUS_PREVIEW_GRID_COLS_V3) return PREVIOUS_PREVIEW_GRID_COLS_V3;
  return PREVIEW_GRID_COLS;
};

const writePreviewGridLayout = (layout: Layout[]) => {
  if (typeof window === 'undefined') return;
  const payload: StoredPreviewGridLayoutPayload = { cols: PREVIEW_GRID_COLS, layout };
  window.localStorage.setItem(PREVIEW_GRID_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
};

const buildDefaultPreviewLayout = (cards: PreviewGridCard[]): Layout[] => {
  const result: Layout[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let currentRowHeight = 0;

  for (const card of cards) {
    const minW = clampPreviewWidth(card.minW ?? PREVIEW_GRID_MIN_W, PREVIEW_GRID_MIN_W);
    const minH = clampPreviewHeight(card.minH ?? PREVIEW_GRID_MIN_H, PREVIEW_GRID_MIN_H);
    const w = clampPreviewWidth(card.defaultW ?? Math.floor(PREVIEW_GRID_COLS / 2), minW);
    const h = clampPreviewHeight(card.defaultH ?? 10, minH);

    if (cursorX + w > PREVIEW_GRID_COLS) {
      cursorX = 0;
      cursorY += currentRowHeight > 0 ? currentRowHeight : h;
      currentRowHeight = 0;
    }

    result.push({
      i: card.id,
      x: cursorX,
      y: cursorY,
      w,
      h,
      minW,
      minH,
      maxH: PREVIEW_GRID_MAX_H,
    });

    cursorX += w;
    currentRowHeight = Math.max(currentRowHeight, h);
  }

  return result;
};

const convertLegacyPreviewLayout = (
  legacyLayout: Record<string, Partial<LegacyPreviewGridLayoutEntry>>,
  cards: PreviewGridCard[],
): Array<Partial<Layout>> => {
  const sortedCards = [...cards].sort((a, b) => {
    const left = toFiniteInt(legacyLayout[a.id]?.order, Number.MAX_SAFE_INTEGER);
    const right = toFiniteInt(legacyLayout[b.id]?.order, Number.MAX_SAFE_INTEGER);
    if (left === right) return a.id.localeCompare(b.id, 'ja');
    return left - right;
  });

  const result: Array<Partial<Layout>> = [];
  let cursorX = 0;
  let cursorY = 0;
  let currentRowHeight = 0;

  for (const card of sortedCards) {
    const minW = clampPreviewWidth(card.minW ?? PREVIEW_GRID_MIN_W, PREVIEW_GRID_MIN_W);
    const minH = clampPreviewHeight(card.minH ?? PREVIEW_GRID_MIN_H, PREVIEW_GRID_MIN_H);
    const w = clampPreviewWidth(
      toFiniteInt(
        legacyLayout[card.id]?.colSpan,
        Math.floor((card.defaultW ?? PREVIEW_GRID_COLS / 2) / PREVIEW_GRID_COL_RATIO),
      ) * PREVIEW_GRID_COL_RATIO,
      minW,
    );
    const h = clampPreviewHeight(card.defaultH ?? 10, minH);

    if (cursorX + w > PREVIEW_GRID_COLS) {
      cursorX = 0;
      cursorY += currentRowHeight > 0 ? currentRowHeight : h;
      currentRowHeight = 0;
    }

    result.push({ i: card.id, x: cursorX, y: cursorY, w, h, minW, minH, maxH: PREVIEW_GRID_MAX_H });
    cursorX += w;
    currentRowHeight = Math.max(currentRowHeight, h);
  }

  return result;
};

const mergePreviewGridLayout = (
  storedLayout: Array<Partial<Layout>>,
  cards: PreviewGridCard[],
): Layout[] => {
  const defaults = buildDefaultPreviewLayout(cards);
  const storedById = new Map<string, Partial<Layout>>();
  for (const item of storedLayout) {
    if (!item?.i) continue;
    storedById.set(item.i, item);
  }

  return defaults.map((fallback) => {
    const card = cards.find((entry) => entry.id === fallback.i);
    const minW = clampPreviewWidth(card?.minW ?? fallback.minW ?? PREVIEW_GRID_MIN_W, PREVIEW_GRID_MIN_W);
    const minH = clampPreviewHeight(card?.minH ?? fallback.minH ?? PREVIEW_GRID_MIN_H, PREVIEW_GRID_MIN_H);
    const current = storedById.get(fallback.i);
    if (!current) {
      return { ...fallback, minW, minH, maxH: PREVIEW_GRID_MAX_H };
    }

    const w = clampPreviewWidth(toFiniteInt(current.w, fallback.w), minW);
    const h = clampPreviewHeight(toFiniteInt(current.h, fallback.h), minH);
    return {
      ...fallback,
      x: Math.max(0, Math.min(PREVIEW_GRID_COLS - w, toFiniteInt(current.x, fallback.x))),
      y: Math.max(0, toFiniteInt(current.y, fallback.y)),
      w,
      h,
      minW,
      minH,
      maxH: PREVIEW_GRID_MAX_H,
    };
  });
};

const readPreviewGridLayout = (cards: PreviewGridCard[]): Layout[] => {
  if (typeof window === 'undefined') return buildDefaultPreviewLayout(cards);
  const raw = window.localStorage.getItem(PREVIEW_GRID_LAYOUT_STORAGE_KEY);
  if (!raw) return buildDefaultPreviewLayout(cards);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const stored = parsed as Array<Partial<Layout>>;
      const storedCols = inferStoredLayoutCols(stored);
      let normalized = scaleLayoutColumns(stored, storedCols, PREVIEW_GRID_COLS);
      if (storedCols === PREVIOUS_PREVIEW_GRID_COLS_V4) {
        normalized = scalePreviewLayoutRows(normalized, 2);
      }
      return mergePreviewGridLayout(normalized, cards);
    }
    if (parsed && typeof parsed === 'object') {
      const payload = parsed as StoredPreviewGridLayoutPayload;
      if (Array.isArray(payload.layout)) {
        const storedCols = toFiniteInt(payload.cols, inferStoredLayoutCols(payload.layout));
        let normalized = scaleLayoutColumns(payload.layout, storedCols, PREVIEW_GRID_COLS);
        if (storedCols === PREVIOUS_PREVIEW_GRID_COLS_V4) {
          normalized = scalePreviewLayoutRows(normalized, 2);
        }
        return mergePreviewGridLayout(normalized, cards);
      }
      return mergePreviewGridLayout(
        convertLegacyPreviewLayout(parsed as Record<string, Partial<LegacyPreviewGridLayoutEntry>>, cards),
        cards,
      );
    }
  } catch {
    // ignore broken localStorage payload
  }

  return buildDefaultPreviewLayout(cards);
};

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-gray-700/70 bg-gray-900/20">
      <div className={`preview-grid-drag-handle flex items-center gap-1 px-1 py-1 ${open ? 'border-b border-gray-700/70' : ''}`}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="preview-grid-no-drag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
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
            className="preview-grid-no-drag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
            aria-label={`${channelLogin} を開く`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {open && <div className="min-h-0 flex-1">{children}</div>}
    </div>
  );
};

type PreviewEmbedProps = {
  title: string;
  src: string;
};

const PreviewEmbed: React.FC<PreviewEmbedProps> = ({ title, src }) => {
  return (
    <div className="h-full min-h-0 overflow-hidden border border-gray-800 bg-black">
      <iframe
        title={title}
        src={src}
        className="h-full w-full"
        allow="autoplay; fullscreen"
        scrolling="no"
      />
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
        <PreviewEmbed title="Twitch Stream Preview" src={playerUrl} />
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
      <PreviewEmbed title={`Twitch Stream Preview - ${channelLogin}`} src={playerUrl} />
    </CompactPreviewFrame>
  );
};

const PreviewGrid: React.FC<{ cards: PreviewGridCard[] }> = ({ cards }) => {
  const [layout, setLayout] = useState<Layout[]>(() =>
    readPreviewGridLayout(cards),
  );
  const [areaHeight, setAreaHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return PREVIEW_AREA_DEFAULT_HEIGHT;
    const stored = window.localStorage.getItem(PREVIEW_AREA_HEIGHT_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return PREVIEW_AREA_DEFAULT_HEIGHT;
    return clampPreviewAreaHeight(parsed);
  });
  const [resizingArea, setResizingArea] = useState(false);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const cardMap = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const { width: gridWidth, mounted: gridMounted, containerRef: gridContainerRef } = useContainerWidth({
    initialWidth: 1280,
  });

  const persistLayout = useCallback((nextLayout: Layout[]) => {
    const normalized = mergePreviewGridLayout(nextLayout, cards);
    setLayout(normalized);
    writePreviewGridLayout(normalized);
  }, [cards]);

  useEffect(() => {
    setLayout((prev) => mergePreviewGridLayout(prev, cards));
  }, [cards]);

  useEffect(() => {
    writePreviewGridLayout(layout);
  }, [layout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREVIEW_AREA_HEIGHT_STORAGE_KEY, String(areaHeight));
  }, [areaHeight]);

  useEffect(() => {
    if (!resizingArea) return;

    const handleMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const delta = event.clientY - resizeStateRef.current.startY;
      setAreaHeight(clampPreviewAreaHeight(resizeStateRef.current.startHeight + delta));
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      setResizingArea(false);
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
  }, [resizingArea]);

  const visibleLayout = useMemo(() => mergePreviewGridLayout(layout, cards), [layout, cards]);

  const handleAreaResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStateRef.current = { startY: event.clientY, startHeight: areaHeight };
    setResizingArea(true);
  };

  return (
    <div className="group relative">
      <div className="overflow-auto" style={{ height: `${areaHeight}px` }}>
        <div ref={gridContainerRef} className="min-h-full">
          {gridMounted && (
            <ReactGridLayout
              className="settings-preview-grid"
              width={gridWidth}
              layout={visibleLayout}
              cols={PREVIEW_GRID_COLS}
              rowHeight={PREVIEW_GRID_ROW_HEIGHT}
              margin={PREVIEW_GRID_MARGIN}
              containerPadding={[0, 0]}
              compactType={null}
              preventCollision
              isDraggable
              isResizable
              onLayoutChange={persistLayout}
              onDragStop={(nextLayout) => persistLayout(nextLayout)}
              onResizeStop={(nextLayout) => persistLayout(nextLayout)}
              resizeHandles={['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']}
              draggableHandle=".preview-grid-drag-handle"
              draggableCancel=".preview-grid-no-drag,iframe,.react-resizable-handle"
            >
              {visibleLayout.map((item) => {
                const card = cardMap.get(item.i);
                if (!card) return null;
                return (
                  <div key={item.i} className="h-full min-h-0">
                    <div className="h-full min-h-0">
                      {card.node}
                    </div>
                  </div>
                );
              })}
            </ReactGridLayout>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="プレビュー領域の高さを調整"
        onPointerDown={handleAreaResizeStart}
        className={`absolute inset-x-4 -bottom-2 z-20 h-4 cursor-row-resize touch-none ${
          resizingArea
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
        }`}
      >
        <div className="mt-1 h-2 w-full rounded bg-blue-500/40" />
      </div>
    </div>
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
  chatWidth: number;
  chatPanel: React.ReactNode;
  onSideChange: (side: 'left' | 'right') => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
  onConnectIrc: (channelLogin: string) => void;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
};

const FollowedChannelsRail: React.FC<FollowedChannelsRailProps> = ({
  side,
  channels,
  loading,
  error,
  chatWidth,
  chatPanel,
  onSideChange,
  onOpenOverlay,
  onOpenOverlayDebug,
  onOpenPresent,
  onOpenPresentDebug,
  onConnectIrc,
  onStartRaid,
}) => {
  const [railMenuOpen, setRailMenuOpen] = useState(false);
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

  useEffect(() => {
    if (!railMenuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-rail-menu="true"]')) return;
      if (target.closest('[data-rail-trigger="true"]')) return;
      setRailMenuOpen(false);
    };

    const closeByEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRailMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeByEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeByEscape);
    };
  }, [railMenuOpen]);

  const tooltipSideClass = side === 'left' ? 'left-full ml-2' : 'right-full mr-2';
  const toggleLabel = side === 'left' ? '右側へ移動' : '左側へ移動';

  return (
    <div
      className={`hidden xl:flex fixed inset-y-0 z-40 bg-gray-900 ${side === 'left' ? 'left-0 flex-row' : 'right-0 flex-row-reverse'}`}
      style={{ width: `${FOLLOWED_RAIL_WIDTH_PX + chatWidth}px` }}
    >
      <div className={`w-12 shrink-0 border-gray-700 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="flex h-full flex-col items-center py-2">
          <div className="relative mb-2">
            <button
              type="button"
              data-rail-trigger="true"
              onClick={() => setRailMenuOpen((prev) => !prev)}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
              aria-label="クイック操作メニュー"
              aria-expanded={railMenuOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
            {railMenuOpen && (
              <div
                data-rail-menu="true"
                className={`absolute top-0 z-50 w-56 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl ${
                  side === 'left' ? 'left-full ml-2' : 'right-full mr-2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSideChange(side === 'left' ? 'right' : 'left');
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  {toggleLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenOverlay();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Layers className="h-3.5 w-3.5 text-gray-300" />
                  <span>オーバーレイ表示</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenOverlayDebug();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Layers className="h-3.5 w-3.5 text-gray-300" />
                  <span>オーバーレイ表示(デバッグ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPresent();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Gift className="h-3.5 w-3.5 text-gray-300" />
                  <span>プレゼントルーレット</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPresentDebug();
                    setRailMenuOpen(false);
                  }}
                  className="inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Gift className="h-3.5 w-3.5 text-gray-300" />
                  <span>プレゼント(デバッグ)</span>
                </button>
              </div>
            )}
          </div>
          <div className="mb-2 h-px w-8 bg-gray-700" />
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
      <div className="min-w-0 flex-1">
        {chatPanel}
      </div>
    </div>
  );
};

type StatusTopBarProps = {
  leftOffset: number;
  rightOffset: number;
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  streamStatus: StreamStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  printerStatusInfo: PrinterStatusInfo | null;
  webServerPort?: number;
  refreshingStreamStatus: boolean;
  reconnectingPrinter: boolean;
  testingPrinter: boolean;
  verifyingTwitch: boolean;
  onTwitchAuth: () => void;
  onRefreshStreamStatus: () => void;
  onVerifyTwitchConfig: () => void;
  onPrinterReconnect: () => void;
  onTestPrint: () => void;
  overlaySettings: OverlaySettingsState | null;
  updateOverlaySettings: (updates: Partial<OverlaySettingsState>) => Promise<void>;
};

const StatusTopBar: React.FC<StatusTopBarProps> = ({
  leftOffset,
  rightOffset,
  featureStatus,
  authStatus,
  streamStatus,
  twitchUserInfo,
  printerStatusInfo,
  webServerPort,
  refreshingStreamStatus,
  reconnectingPrinter,
  testingPrinter,
  verifyingTwitch,
  onTwitchAuth,
  onRefreshStreamStatus,
  onVerifyTwitchConfig,
  onPrinterReconnect,
  onTestPrint,
  overlaySettings,
  updateOverlaySettings,
}) => {
  const { status: micStatus } = useMicCaptionStatus();
  const [openPanel, setOpenPanel] = useState<'system' | 'mic' | null>(null);
  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const micTriggerRef = useRef<HTMLButtonElement | null>(null);
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const micPanelRef = useRef<HTMLDivElement | null>(null);
  const warningCount = featureStatus?.warnings?.length ?? 0;
  const interim = truncateText(micStatus.lastInterimText, 120);
  const finalText = truncateText(micStatus.lastFinalText, 120);
  const translatedText = truncateText(micStatus.lastTranslationText, 120);
  const resolvedWebServerPort = useMemo(() => {
    if (typeof webServerPort === 'number' && webServerPort > 0) return webServerPort;
    if (typeof window === 'undefined') return undefined;
    const port = window.location.port ? Number.parseInt(window.location.port, 10) : NaN;
    return Number.isNaN(port) ? undefined : port;
  }, [webServerPort]);

  useEffect(() => {
    if (!openPanel) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (systemTriggerRef.current?.contains(target)) return;
      if (micTriggerRef.current?.contains(target)) return;
      if (systemPanelRef.current?.contains(target)) return;
      if (micPanelRef.current?.contains(target)) return;
      setOpenPanel(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
      }
    };

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openPanel]);

  const micStateLabel = !micStatus.speechSupported
    ? '非対応'
    : micStatus.recState === 'running'
      ? '実行中'
      : micStatus.recState === 'starting'
        ? '起動中'
        : '停止';

  return (
    <div
      className="fixed left-0 right-0 top-0 z-30 h-12 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm xl:left-[var(--settings-topbar-left)] xl:right-[var(--settings-topbar-right)]"
      style={{
        '--settings-topbar-left': `${leftOffset}px`,
        '--settings-topbar-right': `${rightOffset}px`,
      } as React.CSSProperties}
    >
      <div className="flex h-full items-center justify-between px-4">
        <div className="relative">
          <button
            ref={systemTriggerRef}
            type="button"
            onClick={() => setOpenPanel((prev) => (prev === 'system' ? null : 'system'))}
            className="inline-flex h-8 items-center gap-3 rounded-md border border-gray-700 bg-gray-900/70 px-3 hover:bg-gray-800"
            aria-expanded={openPanel === 'system'}
            aria-label="システム状態を表示"
          >
            <span className="text-[11px] font-semibold text-gray-200">System</span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-300" title={featureStatus?.twitch_configured ? (authStatus?.authenticated ? 'Twitch認証済み' : 'Twitch認証待ち') : 'Twitch未設定'}>
              <Wifi className={`h-3.5 w-3.5 ${!featureStatus?.twitch_configured ? 'text-red-400' : authStatus?.authenticated ? 'text-emerald-400' : 'text-amber-400'}`} />
              Twitch
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-300" title={streamStatus?.is_live ? `配信中 (${streamStatus.viewer_count ?? 0})` : 'オフライン'}>
              <Radio className={`h-3.5 w-3.5 ${streamStatus?.is_live ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
              Live
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-300" title={!featureStatus?.printer_configured ? 'プリンター未設定' : printerStatusInfo?.connected ? 'プリンター接続中' : 'プリンター未接続'}>
              <Server className={`h-3.5 w-3.5 ${!featureStatus?.printer_configured ? 'text-red-400' : printerStatusInfo?.connected ? 'text-emerald-400' : 'text-amber-400'}`} />
              Printer
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-300" title={warningCount > 0 ? `${warningCount}件の警告` : '警告なし'}>
              <AlertTriangle className={`h-3.5 w-3.5 ${warningCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              Warn
            </span>
          </button>
          {openPanel === 'system' && (
            <div
              ref={systemPanelRef}
              className="absolute left-0 top-full z-40 mt-2 w-[440px] rounded-md border border-gray-700 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">システム状態</span>
                <span className="text-[11px] text-gray-400">Web: {resolvedWebServerPort ?? '-'}</span>
              </div>
              <div className="space-y-2">
                <div className="rounded border border-gray-700 bg-black/20 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">Twitch</span>
                    <span className={`text-[11px] ${featureStatus?.twitch_configured ? 'text-emerald-300' : 'text-red-300'}`}>
                      {featureStatus?.twitch_configured ? '設定済み' : '未設定'}
                    </span>
                  </div>
                  {featureStatus?.twitch_configured && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-300">
                          配信: {streamStatus?.is_live ? `LIVE (${streamStatus.viewer_count ?? 0})` : 'OFFLINE'}
                        </span>
                        <button
                          type="button"
                          onClick={onRefreshStreamStatus}
                          disabled={refreshingStreamStatus}
                          className="inline-flex h-6 items-center gap-1 rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                        >
                          <RefreshCw className={`h-3 w-3 ${refreshingStreamStatus ? 'animate-spin' : ''}`} />
                          更新
                        </button>
                      </div>
                      {!authStatus?.authenticated && (
                        <button
                          type="button"
                          onClick={onTwitchAuth}
                          className="inline-flex h-6 items-center rounded border border-amber-600/70 px-2 text-[11px] text-amber-200 hover:bg-amber-700/20"
                        >
                          Twitchで認証
                        </button>
                      )}
                      {authStatus?.authenticated && (
                        <div className="flex items-center justify-between">
                          <span className="truncate text-[11px] text-gray-300">
                            {twitchUserInfo?.verified
                              ? `${twitchUserInfo.login} (${twitchUserInfo.display_name})`
                              : (twitchUserInfo?.error || '検証未完了')}
                          </span>
                          <button
                            type="button"
                            onClick={onVerifyTwitchConfig}
                            disabled={verifyingTwitch}
                            className="ml-2 inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                          >
                            {verifyingTwitch ? '検証中...' : '検証'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded border border-gray-700 bg-black/20 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">プリンター</span>
                    <span className={`text-[11px] ${featureStatus?.printer_configured ? (printerStatusInfo?.connected ? 'text-emerald-300' : 'text-amber-300') : 'text-red-300'}`}>
                      {featureStatus?.printer_configured ? (printerStatusInfo?.connected ? '接続中' : '未接続') : '未設定'}
                    </span>
                  </div>
                  {featureStatus?.printer_configured && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onPrinterReconnect}
                        disabled={reconnectingPrinter}
                        className="inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                      >
                        {reconnectingPrinter ? '再接続中...' : '再接続'}
                      </button>
                      <button
                        type="button"
                        onClick={onTestPrint}
                        disabled={testingPrinter}
                        className="inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                      >
                        {testingPrinter ? 'テスト中...' : 'テスト'}
                      </button>
                    </div>
                  )}
                </div>

                {warningCount > 0 && (
                  <div className="rounded border border-amber-700/60 bg-amber-900/20 p-2">
                    <div className="mb-1 font-medium text-amber-200">警告</div>
                    <div className="space-y-1">
                      {(featureStatus?.warnings ?? []).map((warning: string, index: number) => (
                        <div key={`${warning}-${index}`} className="text-[11px] text-amber-100">
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative flex items-center gap-2">
          <button
            ref={micTriggerRef}
            type="button"
            onClick={() => setOpenPanel((prev) => (prev === 'mic' ? null : 'mic'))}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/70 px-3 hover:bg-gray-800"
            aria-expanded={openPanel === 'mic'}
            aria-label="マイク状態を表示"
          >
            <Mic className={`h-4 w-4 ${micStatus.capturing ? 'text-emerald-400' : micStatus.speechSupported ? 'text-amber-400' : 'text-gray-500'}`} />
            <span className="text-xs text-gray-200">{micStateLabel}</span>
            <Languages className={`h-3.5 w-3.5 ${micStatus.translationEnabled ? 'text-sky-400' : 'text-gray-500'}`} />
            <span className="text-[11px] text-gray-300">
              {micStatus.translationEnabled ? (micStatus.translationTargets.join(', ') || '-') : 'off'}
            </span>
          </button>

          {openPanel === 'mic' && (
            <div
              ref={micPanelRef}
              className="absolute right-0 top-full z-40 mt-2 w-[360px] rounded-md border border-gray-700 bg-gray-900/95 p-2 text-xs text-gray-100 shadow-xl"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">マイク詳細</span>
                <div className="inline-flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">
                    WS: {micStatus.wsConnected ? '接続中' : '未接続'}
                  </span>
                  <Switch
                    aria-label="マイク"
                    checked={overlaySettings?.mic_transcript_speech_enabled ?? false}
                    onCheckedChange={(enabled) => {
                      void updateOverlaySettings({ mic_transcript_speech_enabled: enabled });
                    }}
                  />
                </div>
              </div>
              <div className="mb-1 text-[11px] text-gray-300">
                翻訳: {micStatus.translationEnabled ? `on (${micStatus.translationTargets.join(', ') || '-'})` : 'off'}
              </div>
              <div className="rounded border border-gray-700 bg-black/20 p-2">
                <div className="text-[11px] text-gray-400">認識中</div>
                <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
                  {interim || '...'}
                </div>
              </div>
              <div className="mt-1 rounded border border-gray-700 bg-black/20 p-2">
                <div className="text-[11px] text-gray-400">確定</div>
                <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
                  {finalText || '...'}
                </div>
              </div>
              <div className="mt-1 rounded border border-gray-700 bg-black/20 p-2">
                <div className="text-[11px] text-gray-400">翻訳</div>
                <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
                  {translatedText || '...'}
                </div>
              </div>
            </div>
          )}
        </div>
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

  const configuredChannelLogin = (twitchUserInfo?.login || '').toLowerCase();
  const extraPreviewChannels = useMemo(
    () => ircChannels.filter((channel) => channel !== configuredChannelLogin),
    [configuredChannelLogin, ircChannels],
  );
  const previewCards = useMemo<PreviewGridCard[]>(() => {
    const cards: PreviewGridCard[] = [
      {
        id: 'preview-main',
        defaultW: PREVIEW_GRID_COLS,
        defaultH: 12,
        minW: 1,
        minH: 2,
        node: (
          <TwitchStreamPreview
            isTwitchConfigured={Boolean(featureStatus?.twitch_configured)}
            isAuthenticated={Boolean(authStatus?.authenticated)}
            channelLogin={twitchUserInfo?.login ?? ''}
            isLive={Boolean(streamStatus?.is_live)}
            viewerCount={streamStatus?.viewer_count ?? 0}
          />
        ),
      },
    ];
    for (const channel of extraPreviewChannels) {
      cards.push({
        id: `preview-irc-${channel}`,
        defaultW: Math.max(1, Math.floor(PREVIEW_GRID_COLS / 3)),
        defaultH: 10,
        minW: 1,
        minH: 2,
        node: <AddedChannelStreamPreview channelLogin={channel} />,
      });
    }
    return cards;
  }, [
    authStatus?.authenticated,
    extraPreviewChannels,
    featureStatus?.twitch_configured,
    streamStatus?.is_live,
    streamStatus?.viewer_count,
    twitchUserInfo?.login,
  ]);
  const railReservedWidth = FOLLOWED_RAIL_WIDTH_PX + chatSidebarWidth;
  const topBarOffsets = useMemo(() => ({
    left: followedRailSide === 'left' ? railReservedWidth : 0,
    right: followedRailSide === 'right' ? railReservedWidth : 0,
  }), [followedRailSide, railReservedWidth]);
  const contentInsetStyle = useMemo(() => ({
    '--settings-left-rail-space': followedRailSide === 'left' ? `calc(16px + ${railReservedWidth}px)` : '16px',
    '--settings-right-rail-space': followedRailSide === 'right' ? `calc(16px + ${railReservedWidth}px)` : '16px',
  } as React.CSSProperties), [followedRailSide, railReservedWidth]);

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

  return (
    <div className="min-h-screen bg-gray-900 transition-colors" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="hidden" aria-hidden="true">
        <MicCaptionSender
          variant="switch_only"
          overlaySettings={overlaySettings ?? null}
          webServerPort={webServerPort}
        />
      </div>
      <FollowedChannelsRail
        side={followedRailSide}
        channels={followedChannels}
        loading={followedChannelsLoading}
        error={followedChannelsError}
        chatWidth={chatSidebarWidth}
        chatPanel={(
          <ChatSidebar
            side={followedRailSide}
            width={chatSidebarWidth}
            onWidthChange={handleChatSidebarWidthChange}
            embedded
            fontSize={chatSidebarFontSize}
            onFontSizeChange={handleChatSidebarFontSizeChange}
            translationEnabled={getSettingValue('CHAT_TRANSLATION_ENABLED') !== 'false'}
            onTranslationToggle={(enabled) => handleSettingChange('CHAT_TRANSLATION_ENABLED', enabled)}
            notificationOverwrite={getSettingValue('NOTIFICATION_DISPLAY_MODE') === 'overwrite'}
            onNotificationModeToggle={(enabled) =>
              handleSettingChange('NOTIFICATION_DISPLAY_MODE', enabled ? 'overwrite' : 'queue')}
          />
        )}
        onSideChange={setFollowedRailSide}
        onOpenOverlay={handleOpenOverlay}
        onOpenOverlayDebug={handleOpenOverlayDebug}
        onOpenPresent={handleOpenPresent}
        onOpenPresentDebug={handleOpenPresentDebug}
        onConnectIrc={connectIrcChannel}
        onStartRaid={startRaidToChannel}
      />
      <StatusTopBar
        leftOffset={topBarOffsets.left}
        rightOffset={topBarOffsets.right}
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
        overlaySettings={overlaySettings ?? null}
        updateOverlaySettings={updateOverlaySettings}
      />
      <div
        className="w-full pb-6 pt-16 pl-4 pr-4 xl:pl-[var(--settings-left-rail-space)] xl:pr-[var(--settings-right-rail-space)]"
        style={contentInsetStyle}
      >
        <div className="min-w-0">
          <div className="mb-6">
            <PreviewGrid cards={previewCards} />
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
  );
};
