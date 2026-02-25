import { AlertTriangle, Bluetooth, Bug, ExternalLink, FileText, Gift, HardDrive, Languages, Layers, Magnet, Maximize2, Menu, Mic, Minimize2, Mouse, Music, Plus, Radio, RefreshCw, Server, Settings2, Wifi, X } from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  NodeResizer,
  ReactFlow,
  useNodesState,
  type NodeChange,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { createPortal } from 'react-dom';
import { useSettingsPage, SettingsPageContext } from '../hooks/useSettingsPage';
import { buildApiUrl } from '../utils/api';
import { useMicCaptionStatus } from '../contexts/MicCaptionStatusContext';
import type { AuthStatus, FeatureStatus, PrinterStatusInfo, StreamStatus, TwitchUserInfo } from '../types';
import type { OverlaySettings as OverlaySettingsState } from '../contexts/SettingsContext';
import { WorkspaceCardUiContext } from './ui/collapsible-card';
import { Switch } from './ui/switch';
import { GeneralSettings } from './settings/GeneralSettings';
import { MusicSettings } from './settings/MusicSettings';
import { LogsTab } from './settings/LogsTab';
import { TwitchSettings } from './settings/TwitchSettings';
import { PrinterSettings } from './settings/PrinterSettings';
import { OverlaySettings, type OverlayCardKey } from './settings/OverlaySettings';
import { ApiTab } from './settings/ApiTab';
import { CacheSettings } from './settings/CacheSettings';
import { MicTranscriptionSettings } from './settings/MicTranscriptionSettings';
import { WorkspacePanningSettings } from './settings/WorkspacePanningSettings';
import { TwitchPlayerEmbed } from './settings/TwitchPlayerEmbed';
import { FollowedChannelPopover } from './settings/FollowedChannelPopover';
import { ChatSidebar } from './ChatSidebar';
import { MicCaptionSender } from './mic/MicCaptionSender';
import { PRIMARY_CHAT_TAB_ID, normalizeTwitchChannelName, readIrcChannels, subscribeIrcChannels, writeIrcChannels } from '../utils/chatChannels';
import '@xyflow/react/dist/style.css';

const SIDEBAR_WIDTH_STORAGE_KEY = 'chat_sidebar_width';
const SIDEBAR_FONT_SIZE_STORAGE_KEY = 'chat_sidebar_font_size';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_FONT_SIZE = 12;
const SIDEBAR_MAX_FONT_SIZE = 40;
const SIDEBAR_DEFAULT_FONT_SIZE = 14;
const FOLLOWED_RAIL_SIDE_STORAGE_KEY = 'settings.followed_channels.side';
const FOLLOWED_RAIL_POLL_INTERVAL_MS = 60_000;
const FOLLOWER_COUNT_RETRY_COOLDOWN_MS = 60_000;
const FOLLOWED_RAIL_WIDTH_PX = 48;
const FOLLOWED_RAIL_FETCH_LIMIT = 50;
const WORKSPACE_FLOW_STORAGE_KEY = 'settings.workspace.reactflow.v1';
const WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY = 'settings.workspace.reactflow.last_positions.v1';
const WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY = 'settings.workspace.reactflow.preview_expand_state.v1';
const WORKSPACE_SNAP_ENABLED_STORAGE_KEY = 'settings.workspace.reactflow.snap.enabled.v1';
const WORKSPACE_FLOW_MIN_ZOOM = 0.2;
const WORKSPACE_FLOW_MAX_ZOOM = 1.8;
const WORKSPACE_SNAP_GRID: [number, number] = [24, 24];
const DEFAULT_WORKSPACE_VIEWPORT = { x: 0, y: 0, zoom: 1 };
const PREVIEW_NODE_HEADER_HEIGHT = 36;
const PREVIEW_NODE_MIN_Z_INDEX = 10;
const PREVIEW_NODE_MAX_Z_INDEX = 59;
const PREVIEW_NODE_EXPANDED_Z_INDEX = 60;
const PREVIEW_PORTAL_BASE_Z_INDEX = 200;
const PREVIEW_PORTAL_EXPANDED_Z_INDEX = 1500;
const WORKSPACE_CONTROLS_PROXIMITY_PX = 220;
const QUICK_CONTROLS_HIDE_DELAY_MS = 220;
const WORKSPACE_CARD_SPAWN_SEARCH_STEP = 48;
const WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT = 16;
const WORKSPACE_CARD_SPAWN_MARGIN = 24;

type BaseWorkspaceCardKind =
  | 'preview-main'
  | 'general-basic'
  | 'general-notification'
  | 'general-font'
  | 'mic-speech'
  | 'mic-overlay-display'
  | 'twitch-api'
  | 'twitch-reward-groups'
  | 'twitch-custom-rewards'
  | 'printer-type'
  | 'printer-bluetooth'
  | 'printer-usb'
  | 'printer-print'
  | 'printer-clock'
  | 'music-manager'
  | 'overlay-music-player'
  | 'overlay-fax'
  | 'overlay-clock'
  | 'overlay-mic-transcript'
  | 'overlay-reward-count'
  | 'overlay-lottery'
  | 'logs'
  | 'cache-stats'
  | 'cache-config'
  | 'cache-actions'
  | 'api';

type LegacyWorkspaceCardKind =
  | 'general'
  | 'mic'
  | 'twitch'
  | 'printer'
  | 'music'
  | 'overlay'
  | 'cache';

type WorkspaceCardKind = BaseWorkspaceCardKind | `preview-irc:${string}`;

type WorkspaceCardMenuItem = {
  kind: WorkspaceCardKind;
  label: string;
  description: string;
};

type WorkspaceMenuCategory =
  | 'preview'
  | 'general'
  | 'mic'
  | 'twitch'
  | 'printer'
  | 'music'
  | 'overlay'
  | 'cache'
  | 'system';

type WorkspaceCardNodeData = {
  kind: WorkspaceCardKind;
  title: string;
};

type WorkspaceCardNode = FlowNode<WorkspaceCardNodeData, 'workspace-card'>;
type PreviewViewportExpandSnapshot = {
  position: { x: number; y: number };
  width: number;
  height: number;
  zIndex?: number;
};

type StoredWorkspaceFlowPayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex?: number;
  }>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

type StoredWorkspaceCardLastPositionsPayload = Record<string, { x: number; y: number }>;

type StoredWorkspacePreviewExpandStatePayload = {
  expandedNodeId?: string | null;
  snapshots?: Record<string, { x: number; y: number; width: number; height: number; zIndex?: number }>;
};

type WorkspaceRenderContextValue = {
  removeCard: (id: string) => void;
  refreshPreview: (kind: WorkspaceCardKind) => void;
  togglePreviewViewportExpand: (id: string) => void;
  isPreviewViewportExpanded: (id: string) => boolean;
  isPreviewInteractionEnabled: (kind: WorkspaceCardKind) => boolean;
  togglePreviewInteraction: (kind: WorkspaceCardKind) => void;
  previewPortalEnabled: boolean;
  snapCardSize: (id: string, width: number, height: number) => void;
  renderCard: (kind: WorkspaceCardKind) => React.ReactNode;
  resolvePreviewHeader: (kind: WorkspaceCardKind) => {
    channelLogin: string;
    statusLabel: string;
    statusClassName: string;
    warningMessage: string | null;
    isLinkedChatTab: boolean;
  } | null;
};

const BASE_CARD_KIND_SET = new Set<BaseWorkspaceCardKind>([
  'preview-main',
  'general-basic',
  'general-notification',
  'general-font',
  'mic-speech',
  'mic-overlay-display',
  'twitch-api',
  'twitch-reward-groups',
  'twitch-custom-rewards',
  'printer-type',
  'printer-bluetooth',
  'printer-usb',
  'printer-print',
  'printer-clock',
  'music-manager',
  'overlay-music-player',
  'overlay-fax',
  'overlay-clock',
  'overlay-mic-transcript',
  'overlay-reward-count',
  'overlay-lottery',
  'logs',
  'cache-stats',
  'cache-config',
  'cache-actions',
  'api',
]);

const BASE_WORKSPACE_MENU: WorkspaceCardMenuItem[] = [
  { kind: 'preview-main', label: '配信プレビュー', description: '現在の配信状態と埋め込みプレビュー' },
  { kind: 'general-basic', label: '一般: 基本設定', description: 'タイムゾーンと基本動作' },
  { kind: 'general-notification', label: '一般: 通知設定', description: '通知ウィンドウ表示設定' },
  { kind: 'general-font', label: '一般: フォント設定', description: 'フォントアップロードとプレビュー' },
  { kind: 'mic-speech', label: 'マイク: 音声認識', description: 'Web Speech認識設定' },
  { kind: 'mic-overlay-display', label: 'マイク: 表示設定', description: '文字起こしオーバーレイ表示設定' },
  { kind: 'twitch-api', label: 'Twitch: API設定', description: '認証とAPIキー設定' },
  { kind: 'twitch-reward-groups', label: 'Twitch: リワードグループ', description: 'リワードグループ管理' },
  { kind: 'twitch-custom-rewards', label: 'Twitch: カスタムリワード', description: 'カスタムリワード一覧' },
  { kind: 'printer-type', label: 'プリンター: 種類', description: 'プリンター種別選択' },
  { kind: 'printer-bluetooth', label: 'プリンター: Bluetooth', description: 'Bluetooth接続設定' },
  { kind: 'printer-usb', label: 'プリンター: USB', description: 'USBプリンター設定' },
  { kind: 'printer-print', label: 'プリンター: 印刷設定', description: '品質と印刷動作設定' },
  { kind: 'printer-clock', label: 'プリンター: 時計印刷', description: '毎時印刷設定' },
  { kind: 'music-manager', label: '音楽: 管理', description: 'プレイリストと再生制御' },
  { kind: 'overlay-music-player', label: 'Overlay: 音楽プレイヤー', description: '音楽表示カード設定' },
  { kind: 'overlay-fax', label: 'Overlay: FAX', description: 'FAX表示カード設定' },
  { kind: 'overlay-clock', label: 'Overlay: 時計', description: '時計表示カード設定' },
  { kind: 'overlay-mic-transcript', label: 'Overlay: 文字起こし', description: '字幕表示カード設定' },
  { kind: 'overlay-reward-count', label: 'Overlay: リワード集計', description: 'リワード表示カード設定' },
  { kind: 'overlay-lottery', label: 'Overlay: 抽選', description: '抽選表示カード設定' },
  { kind: 'logs', label: 'ログ', description: '各種ログの確認' },
  { kind: 'cache-stats', label: 'キャッシュ: 統計', description: 'キャッシュ使用状況' },
  { kind: 'cache-config', label: 'キャッシュ: 設定', description: '保存上限と期限設定' },
  { kind: 'cache-actions', label: 'キャッシュ: 管理操作', description: '手動削除とクリーンアップ' },
  { kind: 'api', label: 'API', description: 'API関連の状態確認' },
];

const WORKSPACE_MENU_CATEGORY_ORDER: WorkspaceMenuCategory[] = [
  'preview',
  'general',
  'mic',
  'twitch',
  'printer',
  'music',
  'overlay',
  'cache',
  'system',
];

const WORKSPACE_MENU_CATEGORY_LABELS: Record<WorkspaceMenuCategory, string> = {
  preview: 'プレビュー',
  general: '一般',
  mic: 'マイク',
  twitch: 'Twitch',
  printer: 'プリンター',
  music: '音楽',
  overlay: 'Overlay',
  cache: 'キャッシュ',
  system: 'システム',
};

const resolveWorkspaceMenuCategory = (kind: WorkspaceCardKind): WorkspaceMenuCategory => {
  if (kind.startsWith('preview-')) return 'preview';
  if (kind.startsWith('general-')) return 'general';
  if (kind.startsWith('mic-')) return 'mic';
  if (kind.startsWith('twitch-')) return 'twitch';
  if (kind.startsWith('printer-')) return 'printer';
  if (kind.startsWith('music-')) return 'music';
  if (kind.startsWith('overlay-')) return 'overlay';
  if (kind.startsWith('cache-')) return 'cache';
  return 'system';
};

const LEGACY_WORKSPACE_CARD_KIND_MAP: Record<LegacyWorkspaceCardKind, WorkspaceCardKind> = {
  general: 'general-basic',
  mic: 'mic-speech',
  twitch: 'twitch-api',
  printer: 'printer-type',
  music: 'music-manager',
  overlay: 'overlay-music-player',
  cache: 'cache-stats',
};

const WORKSPACE_RENDER_CONTEXT = createContext<WorkspaceRenderContextValue | null>(null);

const truncateText = (input: string, max = 80) => {
  const normalized = (input || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const clampWorkspaceZoom = (value: unknown, fallback: number) => {
  const parsed = toFiniteNumber(value, fallback);
  return Math.min(WORKSPACE_FLOW_MAX_ZOOM, Math.max(WORKSPACE_FLOW_MIN_ZOOM, parsed));
};

const normalizeWorkspaceViewport = (viewport: { x: unknown; y: unknown; zoom: unknown }): Viewport => ({
  x: toFiniteNumber(viewport.x, DEFAULT_WORKSPACE_VIEWPORT.x),
  y: toFiniteNumber(viewport.y, DEFAULT_WORKSPACE_VIEWPORT.y),
  zoom: clampWorkspaceZoom(viewport.zoom, DEFAULT_WORKSPACE_VIEWPORT.zoom),
});

const readStoredWorkspaceViewport = (value: unknown): Viewport | null => {
  if (!value || typeof value !== 'object') return null;
  const viewport = value as Record<string, unknown>;
  if (!Number.isFinite(Number(viewport.zoom))) return null;
  return normalizeWorkspaceViewport({
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  });
};

const isPreviewIrcKind = (kind: string): kind is `preview-irc:${string}` =>
  kind.startsWith('preview-irc:') && kind.length > 'preview-irc:'.length;

const isPreviewCardKind = (kind: WorkspaceCardKind) =>
  kind === 'preview-main' || isPreviewIrcKind(kind);

const isWorkspaceCardKind = (kind: string): kind is WorkspaceCardKind =>
  BASE_CARD_KIND_SET.has(kind as BaseWorkspaceCardKind) || isPreviewIrcKind(kind);

const normalizeWorkspaceCardKind = (kind: string): WorkspaceCardKind | null => {
  if (isWorkspaceCardKind(kind)) return kind;
  if (kind in LEGACY_WORKSPACE_CARD_KIND_MAP) {
    return LEGACY_WORKSPACE_CARD_KIND_MAP[kind as LegacyWorkspaceCardKind];
  }
  return null;
};

const readWorkspaceCardLastPositions = (): Partial<Record<WorkspaceCardKind, { x: number; y: number }>> => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoredWorkspaceCardLastPositionsPayload;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Partial<Record<WorkspaceCardKind, { x: number; y: number }>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isWorkspaceCardKind(key)) continue;
      if (!value || typeof value !== 'object') continue;
      const x = toFiniteNumber((value as { x?: unknown }).x, Number.NaN);
      const y = toFiniteNumber((value as { y?: unknown }).y, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      result[key] = { x, y };
    }
    return result;
  } catch {
    return {};
  }
};

const writeWorkspaceCardLastPositions = (positions: Partial<Record<WorkspaceCardKind, { x: number; y: number }>>) => {
  if (typeof window === 'undefined') return;
  const payload: StoredWorkspaceCardLastPositionsPayload = {};
  for (const [key, position] of Object.entries(positions)) {
    if (!position || !isWorkspaceCardKind(key)) continue;
    payload[key] = {
      x: toFiniteNumber(position.x, 0),
      y: toFiniteNumber(position.y, 0),
    };
  }
  window.localStorage.setItem(WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY, JSON.stringify(payload));
};

const readWorkspacePreviewExpandState = (): {
  expandedNodeId: string | null;
  snapshots: Record<string, PreviewViewportExpandSnapshot>;
} => {
  if (typeof window === 'undefined') {
    return { expandedNodeId: null, snapshots: {} };
  }
  const raw = window.localStorage.getItem(WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY);
  if (!raw) {
    return { expandedNodeId: null, snapshots: {} };
  }

  try {
    const parsed = JSON.parse(raw) as StoredWorkspacePreviewExpandStatePayload;
    if (!parsed || typeof parsed !== 'object') {
      return { expandedNodeId: null, snapshots: {} };
    }

    const expandedNodeId = typeof parsed.expandedNodeId === 'string' && parsed.expandedNodeId
      ? parsed.expandedNodeId
      : null;
    const snapshots: Record<string, PreviewViewportExpandSnapshot> = {};
    const snapshotEntries = parsed.snapshots && typeof parsed.snapshots === 'object'
      ? Object.entries(parsed.snapshots)
      : [];
    for (const [nodeId, rawSnapshot] of snapshotEntries) {
      if (!nodeId || !rawSnapshot || typeof rawSnapshot !== 'object') continue;
      const x = toFiniteNumber((rawSnapshot as { x?: unknown }).x, Number.NaN);
      const y = toFiniteNumber((rawSnapshot as { y?: unknown }).y, Number.NaN);
      const width = toFiniteNumber((rawSnapshot as { width?: unknown }).width, Number.NaN);
      const height = toFiniteNumber((rawSnapshot as { height?: unknown }).height, Number.NaN);
      const rawZIndex = toFiniteNumber((rawSnapshot as { zIndex?: unknown }).zIndex, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        continue;
      }
      snapshots[nodeId] = {
        position: { x, y },
        width,
        height,
        zIndex: Number.isFinite(rawZIndex) ? rawZIndex : undefined,
      };
    }

    return { expandedNodeId, snapshots };
  } catch {
    return { expandedNodeId: null, snapshots: {} };
  }
};

const writeWorkspacePreviewExpandState = (
  expandedNodeId: string | null,
  snapshots: Record<string, PreviewViewportExpandSnapshot>,
) => {
  if (typeof window === 'undefined') return;
  const payload: StoredWorkspacePreviewExpandStatePayload = {
    expandedNodeId: expandedNodeId || null,
    snapshots: {},
  };
  for (const [nodeId, snapshot] of Object.entries(snapshots)) {
    if (!nodeId || !snapshot) continue;
    const x = toFiniteNumber(snapshot.position.x, Number.NaN);
    const y = toFiniteNumber(snapshot.position.y, Number.NaN);
    const width = toFiniteNumber(snapshot.width, Number.NaN);
    const height = toFiniteNumber(snapshot.height, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }
    payload.snapshots![nodeId] = {
      x,
      y,
      width,
      height,
      zIndex: Number.isFinite(toFiniteNumber(snapshot.zIndex, Number.NaN))
        ? toFiniteNumber(snapshot.zIndex, Number.NaN)
        : undefined,
    };
  }
  window.localStorage.setItem(WORKSPACE_PREVIEW_EXPAND_STATE_STORAGE_KEY, JSON.stringify(payload));
};

const normalizeWorkspaceZoomActivationKeyCode = (value: string): string => {
  const normalized = (value || '').trim();
  return normalized || 'Control';
};

const isZoomActivationPressed = (event: KeyboardEvent, activationKeyCode: string): boolean => {
  if (
    activationKeyCode === 'Control'
    || activationKeyCode === 'Meta'
    || activationKeyCode === 'Alt'
    || activationKeyCode === 'Shift'
  ) {
    return event.getModifierState(activationKeyCode);
  }
  return event.code === activationKeyCode;
};

const resolveWorkspaceCardTitle = (kind: WorkspaceCardKind) => {
  const staticItem = BASE_WORKSPACE_MENU.find((item) => item.kind === kind);
  if (staticItem) return staticItem.label;
  if (isPreviewIrcKind(kind)) {
    const channel = kind.slice('preview-irc:'.length);
    return `IRCプレビュー: ${channel}`;
  }
  return kind;
};

const snapWorkspaceSizeToGrid = (size: { width: number; height: number }) => ({
  width: Math.max(WORKSPACE_SNAP_GRID[0], Math.round(size.width / WORKSPACE_SNAP_GRID[0]) * WORKSPACE_SNAP_GRID[0]),
  height: Math.max(WORKSPACE_SNAP_GRID[1], Math.round(size.height / WORKSPACE_SNAP_GRID[1]) * WORKSPACE_SNAP_GRID[1]),
});

const resolveWorkspaceCardSize = (kind: WorkspaceCardKind) => {
  if (kind === 'preview-main' || isPreviewIrcKind(kind)) return snapWorkspaceSizeToGrid({ width: 640, height: 396 });
  if (kind === 'twitch-custom-rewards') return snapWorkspaceSizeToGrid({ width: 960, height: 640 });
  if (
    kind === 'overlay-music-player' ||
    kind === 'overlay-fax' ||
    kind === 'overlay-clock' ||
    kind === 'overlay-mic-transcript' ||
    kind === 'overlay-reward-count' ||
    kind === 'overlay-lottery'
  ) {
    return snapWorkspaceSizeToGrid({ width: 820, height: 620 });
  }
  if (kind === 'logs' || kind === 'api') return snapWorkspaceSizeToGrid({ width: 760, height: 560 });
  return snapWorkspaceSizeToGrid({ width: 640, height: 520 });
};

const resolveWorkspaceNodeSize = (node: WorkspaceCardNode) => {
  const defaults = resolveWorkspaceCardSize(node.data.kind);
  const width = toFiniteNumber(
    node.width,
    toFiniteNumber(
      node.measured?.width,
      toFiniteNumber((node.style as Record<string, unknown> | undefined)?.width, defaults.width),
    ),
  );
  const height = toFiniteNumber(
    node.height,
    toFiniteNumber(
      node.measured?.height,
      toFiniteNumber((node.style as Record<string, unknown> | undefined)?.height, defaults.height),
    ),
  );
  return { width, height };
};

const findAvailableWorkspaceCardPosition = (
  kind: WorkspaceCardKind,
  preferred: { x: number; y: number },
  existingNodes: WorkspaceCardNode[],
) => {
  const targetSize = resolveWorkspaceCardSize(kind);
  const intersectsExistingCard = (position: { x: number; y: number }) => {
    const left = position.x;
    const right = position.x + targetSize.width;
    const top = position.y;
    const bottom = position.y + targetSize.height;
    return existingNodes.some((node) => {
      const size = resolveWorkspaceNodeSize(node);
      const nodeLeft = node.position.x;
      const nodeRight = node.position.x + size.width;
      const nodeTop = node.position.y;
      const nodeBottom = node.position.y + size.height;
      return !(
        right + WORKSPACE_CARD_SPAWN_MARGIN <= nodeLeft
        || left >= nodeRight + WORKSPACE_CARD_SPAWN_MARGIN
        || bottom + WORKSPACE_CARD_SPAWN_MARGIN <= nodeTop
        || top >= nodeBottom + WORKSPACE_CARD_SPAWN_MARGIN
      );
    });
  };

  if (!intersectsExistingCard(preferred)) return preferred;

  for (let ring = 1; ring <= WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const candidate = {
          x: preferred.x + (dx * WORKSPACE_CARD_SPAWN_SEARCH_STEP),
          y: preferred.y + (dy * WORKSPACE_CARD_SPAWN_SEARCH_STEP),
        };
        if (!intersectsExistingCard(candidate)) {
          return candidate;
        }
      }
    }
  }

  return {
    x: preferred.x + (WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT * WORKSPACE_CARD_SPAWN_SEARCH_STEP),
    y: preferred.y + (WORKSPACE_CARD_SPAWN_SEARCH_RING_LIMIT * WORKSPACE_CARD_SPAWN_SEARCH_STEP),
  };
};

const reorderPreviewNodesForFront = (
  nodes: WorkspaceCardNode[],
  frontNodeId: string,
  expandedPreviewNodeId: string | null,
) => {
  const target = nodes.find((node) => node.id === frontNodeId);
  if (!target || !isPreviewCardKind(target.data.kind)) return nodes;
  if (expandedPreviewNodeId === frontNodeId) {
    const expandedNode = nodes.find((node) => node.id === expandedPreviewNodeId);
    if (!expandedNode || expandedNode.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX) return nodes;
    return nodes.map((node) => (
      node.id === expandedPreviewNodeId
        ? { ...node, zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX }
        : node
    ));
  }

  const orderedPreviewNodes = nodes
    .filter((node) => isPreviewCardKind(node.data.kind) && node.id !== expandedPreviewNodeId)
    .map((node, index) => ({
      node,
      index,
      zIndex: toFiniteNumber(node.zIndex, PREVIEW_NODE_MIN_Z_INDEX),
    }))
    .sort((a, b) => (a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.index - b.index))
    .map(({ node }) => node)
    .filter((node) => node.id !== frontNodeId);

  const availableLowerSlots = PREVIEW_NODE_MAX_Z_INDEX - PREVIEW_NODE_MIN_Z_INDEX;
  const normalizeStartIndex = Math.max(0, orderedPreviewNodes.length - availableLowerSlots);
  const nextZIndexById = new Map<string, number>();
  orderedPreviewNodes.slice(normalizeStartIndex).forEach((node, index) => {
    nextZIndexById.set(node.id, PREVIEW_NODE_MIN_Z_INDEX + index);
  });
  nextZIndexById.set(frontNodeId, PREVIEW_NODE_MAX_Z_INDEX);

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (expandedPreviewNodeId && node.id === expandedPreviewNodeId) {
      if (node.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX) return node;
      changed = true;
      return { ...node, zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX };
    }
    const nextZIndex = nextZIndexById.get(node.id);
    if (nextZIndex == null || node.zIndex === nextZIndex) return node;
    changed = true;
    return { ...node, zIndex: nextZIndex };
  });
  return changed ? nextNodes : nodes;
};

const resolveWorkspaceCardMinSize = (kind: WorkspaceCardKind) => {
  if (isPreviewCardKind(kind)) {
    // Twitch iframe autoplay requires at least 400x300; node header consumes 36px height.
    return { minWidth: 400, minHeight: 336 };
  }
  return { minWidth: 320, minHeight: 220 };
};

const isCollapsibleCardNodeKind = (kind: WorkspaceCardKind) => {
  if (isPreviewCardKind(kind)) return false;
  if (kind === 'logs') return false;
  return true;
};

const createWorkspaceNodeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createWorkspaceNode = (
  kind: WorkspaceCardKind,
  position: { x: number; y: number },
  options: { id?: string; width?: number; height?: number; zIndex?: number } = {},
): WorkspaceCardNode => {
  const defaults = resolveWorkspaceCardSize(kind);
  const mins = resolveWorkspaceCardMinSize(kind);
  const width = Math.max(mins.minWidth, toFiniteNumber(options.width, defaults.width));
  const height = Math.max(mins.minHeight, toFiniteNumber(options.height, defaults.height));
  return {
    id: options.id ?? createWorkspaceNodeId(),
    type: 'workspace-card',
    position: { x: toFiniteNumber(position.x, 0), y: toFiniteNumber(position.y, 0) },
    dragHandle: '.workspace-node-drag-handle,[data-workspace-node-drag-handle="true"]',
    data: {
      kind,
      title: resolveWorkspaceCardTitle(kind),
    },
    width,
    height,
    zIndex: Number.isFinite(toFiniteNumber(options.zIndex, Number.NaN))
      ? toFiniteNumber(options.zIndex, Number.NaN)
      : undefined,
  };
};

const readWorkspaceFlow = (): { nodes: WorkspaceCardNode[]; viewport: Viewport | null } | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(WORKSPACE_FLOW_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWorkspaceFlowPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    const parsedNodes = Array.isArray(parsed.nodes)
      ? parsed.nodes
        .map((node) => {
          if (!node || typeof node !== 'object') return null;
          const normalizedKind = normalizeWorkspaceCardKind(node.kind);
          if (typeof node.id !== 'string' || !normalizedKind) return null;
          return createWorkspaceNode(
            normalizedKind,
            { x: toFiniteNumber(node.x, 0), y: toFiniteNumber(node.y, 0) },
            {
              id: node.id,
              width: toFiniteNumber(node.width, resolveWorkspaceCardSize(normalizedKind).width),
              height: toFiniteNumber(node.height, resolveWorkspaceCardSize(normalizedKind).height),
              zIndex: toFiniteNumber(node.zIndex, Number.NaN),
            },
          );
        })
        .filter((node): node is WorkspaceCardNode => node !== null)
      : [];
    const dedupedNodes: WorkspaceCardNode[] = [];
    const seenKinds = new Set<WorkspaceCardKind>();
    for (const node of parsedNodes) {
      if (seenKinds.has(node.data.kind)) {
        continue;
      }
      seenKinds.add(node.data.kind);
      dedupedNodes.push(node);
    }

    return {
      nodes: dedupedNodes,
      viewport: readStoredWorkspaceViewport(parsed.viewport),
    };
  } catch {
    return null;
  }
};

const writeWorkspaceFlow = (nodes: WorkspaceCardNode[], viewport: Viewport | null) => {
  if (typeof window === 'undefined') return;
  const payload: StoredWorkspaceFlowPayload = {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      x: node.position.x,
      y: node.position.y,
      width: toFiniteNumber(
        node.width,
        toFiniteNumber(
          node.measured?.width,
          toFiniteNumber((node.style as Record<string, unknown> | undefined)?.width, resolveWorkspaceCardSize(node.data.kind).width),
        ),
      ),
      height: toFiniteNumber(
        node.height,
        toFiniteNumber(
          node.measured?.height,
          toFiniteNumber((node.style as Record<string, unknown> | undefined)?.height, resolveWorkspaceCardSize(node.data.kind).height),
        ),
      ),
      zIndex: Number.isFinite(toFiniteNumber(node.zIndex, Number.NaN))
        ? toFiniteNumber(node.zIndex, Number.NaN)
        : undefined,
    })),
  };
  if (viewport) {
    payload.viewport = normalizeWorkspaceViewport(viewport);
  }
  window.localStorage.setItem(WORKSPACE_FLOW_STORAGE_KEY, JSON.stringify(payload));
};

type TwitchStreamPreviewProps = {
  isTwitchConfigured: boolean;
  isAuthenticated: boolean;
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (warningMessage: string | null) => void;
};

type CompactPreviewFrameProps = {
  panelId: string;
  children: React.ReactNode;
};

const CompactPreviewFrame: React.FC<CompactPreviewFrameProps> = ({
  panelId: _panelId,
  children,
}) => {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-gray-900/20">
      <div className="min-h-0 h-full">{children}</div>
    </div>
  );
};

type PreviewEmbedProps = {
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (warningMessage: string | null) => void;
};

const PreviewEmbed: React.FC<PreviewEmbedProps> = ({
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  return (
    <div className="nodrag nopan h-full min-h-0 overflow-hidden bg-black">
      <TwitchPlayerEmbed
        channelLogin={channelLogin}
        reloadNonce={reloadNonce}
        autoplayEnabled={autoplayEnabled}
        interactionDisabled={interactionDisabled}
        onWarningChange={onWarningChange}
      />
    </div>
  );
};

const TwitchStreamPreview: React.FC<TwitchStreamPreviewProps> = ({
  isTwitchConfigured,
  isAuthenticated,
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  const canEmbed = Boolean(channelLogin);

  useEffect(() => {
    if (isTwitchConfigured && isAuthenticated && canEmbed) return;
    onWarningChange(null);
  }, [canEmbed, isAuthenticated, isTwitchConfigured, onWarningChange]);

  return (
    <CompactPreviewFrame panelId="settings.twitch.stream-preview">
      {!isTwitchConfigured && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">Twitch設定が未完了です。</p>
        </div>
      )}
      {isTwitchConfigured && !isAuthenticated && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">Twitch認証後にプレビューを表示します。</p>
        </div>
      )}
      {isTwitchConfigured && isAuthenticated && !canEmbed && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">ユーザー情報を検証中です。少し待つか、Twitch設定で再検証してください。</p>
        </div>
      )}
      {isTwitchConfigured && isAuthenticated && canEmbed && (
        <PreviewEmbed
          channelLogin={channelLogin}
          reloadNonce={reloadNonce}
          autoplayEnabled={autoplayEnabled}
          interactionDisabled={interactionDisabled}
          onWarningChange={onWarningChange}
        />
      )}
    </CompactPreviewFrame>
  );
};

type AddedChannelStreamPreviewProps = {
  kind: WorkspaceCardKind;
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (kind: WorkspaceCardKind, warningMessage: string | null) => void;
};

const AddedChannelStreamPreview: React.FC<AddedChannelStreamPreviewProps> = ({
  kind,
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  return (
    <CompactPreviewFrame panelId={`settings.twitch.stream-preview.irc.${channelLogin}`}>
      <PreviewEmbed
        channelLogin={channelLogin}
        reloadNonce={reloadNonce}
        autoplayEnabled={autoplayEnabled}
        interactionDisabled={interactionDisabled}
        onWarningChange={(warningMessage) => onWarningChange(kind, warningMessage)}
      />
    </CompactPreviewFrame>
  );
};

const WorkspaceCardNodeView: React.FC<NodeProps<WorkspaceCardNode>> = ({ id, data, selected, dragging, zIndex }) => {
  const renderContext = useContext(WORKSPACE_RENDER_CONTEXT);
  if (!renderContext) return null;
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [warningTooltip, setWarningTooltip] = useState<{ message: string; x: number; y: number; fontFamily: string } | null>(null);
  const [previewPortalRect, setPreviewPortalRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const previewContentHostRef = useRef<HTMLDivElement | null>(null);
  const cardAsNode = isCollapsibleCardNodeKind(data.kind);
  const previewHeader = cardAsNode ? null : renderContext.resolvePreviewHeader(data.kind);
  const minSize = resolveWorkspaceCardMinSize(data.kind);
  const showResizeHandles = selected || isHovered || isResizing;
  const isNodeInteractionLocked = isResizing || Boolean(dragging);
  const nodeInteractionClassName = isResizing ? 'pointer-events-none select-none' : '';
  const isPreviewViewportExpanded = renderContext.isPreviewViewportExpanded(id);
  const previewPortalZIndex = isPreviewViewportExpanded
    ? PREVIEW_PORTAL_EXPANDED_Z_INDEX
    : PREVIEW_PORTAL_BASE_Z_INDEX + toFiniteNumber(zIndex, PREVIEW_NODE_MIN_Z_INDEX);
  const previewInteractionEnabled = previewHeader ? renderContext.isPreviewInteractionEnabled(data.kind) : true;
  const isPreviewPointerInputBlocked = isNodeInteractionLocked || !previewInteractionEnabled;
  const previewHeaderClassName = previewHeader?.isLinkedChatTab
    ? 'border-b border-sky-400/60 bg-sky-500/20'
    : 'border-b border-gray-800/80 bg-gray-900/85';
  const shouldPortalPreviewContent =
    Boolean(previewHeader)
    && renderContext.previewPortalEnabled
    && typeof document !== 'undefined';
  const previewContentNode = cardAsNode ? null : renderContext.renderCard(data.kind);

  const hideWarningTooltip = useCallback(() => {
    setWarningTooltip(null);
  }, []);

  const showWarningTooltip = useCallback((target: HTMLElement, message: string) => {
    if (typeof window === 'undefined') return;
    const rect = target.getBoundingClientRect();
    const { fontFamily } = window.getComputedStyle(target);
    const tooltipWidth = 288;
    const x = Math.max(8, Math.min(window.innerWidth - tooltipWidth - 8, rect.right - tooltipWidth));
    const y = rect.bottom + 8;
    setWarningTooltip({ message, x, y, fontFamily });
  }, []);

  useEffect(() => {
    if (!warningTooltip) return undefined;
    const hide = () => setWarningTooltip(null);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [warningTooltip]);

  useEffect(() => {
    if (!shouldPortalPreviewContent) {
      setPreviewPortalRect(null);
      return undefined;
    }
    let rafId = 0;
    let isDisposed = false;
    let lastSerializedRect = '';

    const updateRect = () => {
      if (isDisposed) return;
      const host = previewContentHostRef.current;
      if (!host) {
        rafId = window.requestAnimationFrame(updateRect);
        return;
      }
      const rect = host.getBoundingClientRect();
      const nextRect = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      const serialized = `${nextRect.left}:${nextRect.top}:${nextRect.width}:${nextRect.height}`;
      if (serialized !== lastSerializedRect) {
        lastSerializedRect = serialized;
        setPreviewPortalRect(nextRect.width > 0 && nextRect.height > 0 ? nextRect : null);
      }
      rafId = window.requestAnimationFrame(updateRect);
    };

    rafId = window.requestAnimationFrame(updateRect);
    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [shouldPortalPreviewContent]);

  return (
    <div
      className="relative h-full min-h-0 min-w-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer
        minWidth={minSize.minWidth}
        minHeight={minSize.minHeight}
        isVisible={showResizeHandles}
        lineClassName="!border-transparent"
        handleClassName="!h-3.5 !w-3.5 !rounded-sm !border-none !bg-transparent !opacity-0"
        onResizeStart={() => {
          setIsResizing(true);
        }}
        onResizeEnd={(_event, params) => {
          setIsResizing(false);
          renderContext.snapCardSize(id, params.width, params.height);
        }}
      />
      {cardAsNode ? (
        <div className={`settings-node-card-shell h-full min-h-0 ${nodeInteractionClassName}`}>
          <WorkspaceCardUiContext.Provider
            value={{ onClose: () => renderContext.removeCard(id), nodeMode: true }}
          >
            {renderContext.renderCard(data.kind)}
          </WorkspaceCardUiContext.Provider>
        </div>
      ) : (
        <div className={`h-full min-h-0 overflow-hidden rounded-md border border-gray-800/80 bg-gray-950/20 ${nodeInteractionClassName}`}>
          <div className={`workspace-node-drag-handle flex h-9 items-center px-3 ${previewHeaderClassName}`}>
            {previewHeader ? (
              <>
                <span className="truncate font-mono text-xs text-gray-200">channel: {previewHeader.channelLogin || '-'}</span>
                <span className={`ml-2 shrink-0 text-[11px] ${previewHeader.statusClassName}`}>{previewHeader.statusLabel}</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => renderContext.togglePreviewInteraction(data.kind)}
                    className={`nodrag inline-flex h-6 w-6 items-center justify-center rounded border ${
                      previewInteractionEnabled
                        ? 'border-sky-500/50 bg-sky-500/20 text-sky-300 hover:bg-sky-500/25'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20'
                    }`}
                    title={previewInteractionEnabled ? 'プレビュー操作をロックする' : 'プレビュー操作を有効化する'}
                    aria-label={previewInteractionEnabled ? 'プレビュー操作をロックする' : 'プレビュー操作を有効化する'}
                  >
                    <Mouse className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => renderContext.refreshPreview(data.kind)}
                    className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                    aria-label="プレビューを更新"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => renderContext.togglePreviewViewportExpand(id)}
                    className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                    aria-label={isPreviewViewportExpanded ? 'プレビュー拡大を解除' : 'プレビューを一時拡大'}
                    title={isPreviewViewportExpanded ? '拡大解除' : '一時拡大'}
                  >
                    {isPreviewViewportExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                  {previewHeader.channelLogin && (
                    <a
                      href={`https://www.twitch.tv/${encodeURIComponent(previewHeader.channelLogin)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                      aria-label={`${previewHeader.channelLogin} を開く`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {previewHeader.warningMessage && (
                    <button
                      type="button"
                      className="nodrag inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-semibold text-amber-300"
                      aria-label={`プレビュー警告: ${previewHeader.warningMessage}`}
                      onMouseEnter={(event) => showWarningTooltip(event.currentTarget, previewHeader.warningMessage as string)}
                      onMouseLeave={hideWarningTooltip}
                      onFocus={(event) => showWarningTooltip(event.currentTarget, previewHeader.warningMessage as string)}
                      onBlur={hideWarningTooltip}
                    >
                      !
                    </button>
                  )}
                  <button
                    type="button"
                    className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                    onClick={() => renderContext.removeCard(id)}
                    aria-label="カードを削除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <span className="truncate text-xs font-semibold text-gray-200">{data.title}</span>
            )}
            {!previewHeader && (
              <button
                type="button"
                className="nodrag ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                onClick={() => renderContext.removeCard(id)}
                aria-label="カードを削除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div
            ref={previewContentHostRef}
            className={`nodrag nowheel h-[calc(100%-2.25rem)] overflow-auto ${isPreviewPointerInputBlocked ? 'pointer-events-none select-none' : ''}`}
          >
            {shouldPortalPreviewContent ? <div className="h-full w-full" /> : previewContentNode}
          </div>
        </div>
      )}
      {shouldPortalPreviewContent && previewPortalRect && typeof document !== 'undefined' && createPortal(
        <div
          className={`nodrag nowheel overflow-hidden ${isPreviewPointerInputBlocked ? 'pointer-events-none select-none' : ''}`}
          style={{
            position: 'fixed',
            left: previewPortalRect.left,
            top: previewPortalRect.top,
            width: previewPortalRect.width,
            height: previewPortalRect.height,
            zIndex: previewPortalZIndex,
          }}
        >
          {previewContentNode}
        </div>,
        document.body,
      )}
      {warningTooltip && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: warningTooltip.x,
            top: warningTooltip.y,
            width: 288,
            zIndex: 2000,
            fontFamily: warningTooltip.fontFamily,
          }}
          className="pointer-events-none rounded border border-amber-500/40 bg-gray-950 px-2 py-1 text-[11px] leading-relaxed text-amber-200 shadow-lg"
        >
          {warningTooltip.message}
        </div>,
        document.body,
      )}
    </div>
  );
};

const WORKSPACE_NODE_TYPES: NodeTypes = {
  'workspace-card': WorkspaceCardNodeView,
};

export type FollowedChannelRailItem = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  profile_image_url: string;
  followed_at?: string;
  is_live: boolean;
  viewer_count: number;
  follower_count?: number | null;
  title?: string | null;
  game_name?: string | null;
  started_at?: string | null;
  last_broadcast_at?: string | null;
};

type FollowedChannelsRailProps = {
  side: 'left' | 'right';
  channels: FollowedChannelRailItem[];
  loading: boolean;
  error: string;
  canStartRaid: boolean;
  chatWidth: number;
  chatPanel: React.ReactNode;
  onSideChange: (side: 'left' | 'right') => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
  onAddIrcPreview: (channelLogin: string) => void;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
  onStartShoutout: (channel: FollowedChannelRailItem) => Promise<void>;
};

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 10_000) return `${(count / 1000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

const FollowedChannelsRail: React.FC<FollowedChannelsRailProps> = ({
  side,
  channels,
  loading,
  error,
  canStartRaid,
  chatWidth,
  chatPanel,
  onSideChange,
  onOpenOverlay,
  onOpenOverlayDebug,
  onOpenPresent,
  onOpenPresentDebug,
  onAddIrcPreview,
  onStartRaid,
  onStartShoutout,
}) => {
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [raidConfirmChannelId, setRaidConfirmChannelId] = useState<string | null>(null);
  const [raidingChannelId, setRaidingChannelId] = useState<string | null>(null);
  const [shoutoutingChannelId, setShoutoutingChannelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ top: number; left: number } | null>(null);
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(() => readIrcChannels());
  const [followerCountByChannelId, setFollowerCountByChannelId] = useState<Record<string, number>>({});
  const [loadingFollowerChannelIds, setLoadingFollowerChannelIds] = useState<Record<string, true>>({});
  const followerCountByChannelIdRef = useRef<Record<string, number>>({});
  const followerCountFetchInFlightRef = useRef<Set<string>>(new Set());
  const followerCountRetryAfterByChannelIdRef = useRef<Record<string, number>>({});
  const copiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    followerCountByChannelIdRef.current = followerCountByChannelId;
  }, [followerCountByChannelId]);

  useEffect(() => {
    if (openChannelId && !channels.some((item) => item.broadcaster_id === openChannelId)) {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
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
      setShoutoutingChannelId(null);
      setActionError('');
    };

    const closeByResize = () => {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
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
    return () => {
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeIrcChannels((channels) => {
      setIrcConnectedChannels(channels);
    });
  }, []);

  useEffect(() => {
    setFollowerCountByChannelId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const channel of channels) {
        const channelId = (channel.broadcaster_id || '').trim();
        if (channelId === '') continue;
        if (typeof channel.follower_count !== 'number') continue;
        if (next[channelId] === channel.follower_count) continue;
        next[channelId] = channel.follower_count;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [channels]);

  const ensureFollowerCount = useCallback(async (channel: FollowedChannelRailItem) => {
    const channelId = (channel.broadcaster_id || '').trim();
    if (channelId === '') return;
    const retryAfterAt = followerCountRetryAfterByChannelIdRef.current[channelId] || 0;
    if (retryAfterAt > Date.now()) {
      return;
    }
    if (typeof followerCountByChannelIdRef.current[channelId] === 'number') {
      return;
    }
    if (typeof channel.follower_count === 'number') {
      const immediateFollowerCount = channel.follower_count;
      setFollowerCountByChannelId((prev) => {
        if (prev[channelId] === immediateFollowerCount) return prev;
        return { ...prev, [channelId]: immediateFollowerCount };
      });
      return;
    }
    if (followerCountFetchInFlightRef.current.has(channelId)) {
      return;
    }

    followerCountFetchInFlightRef.current.add(channelId);
    setLoadingFollowerChannelIds((prev) => ({ ...prev, [channelId]: true }));
    try {
      const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: channelId,
          login: channel.broadcaster_login,
          username: channel.broadcaster_login,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json().catch(() => null);
      const followerCount = typeof payload?.follower_count === 'number' ? payload.follower_count : undefined;
      if (typeof followerCount === 'number') {
        delete followerCountRetryAfterByChannelIdRef.current[channelId];
        setFollowerCountByChannelId((prev) => {
          if (prev[channelId] === followerCount) return prev;
          return { ...prev, [channelId]: followerCount };
        });
      } else {
        followerCountRetryAfterByChannelIdRef.current[channelId] = Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
        setFollowerCountByChannelId((prev) => {
          if (!(channelId in prev)) return prev;
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    } catch {
      followerCountRetryAfterByChannelIdRef.current[channelId] = Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
    } finally {
      followerCountFetchInFlightRef.current.delete(channelId);
      setLoadingFollowerChannelIds((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });
    }
  }, []);

  const resolveFollowerCountLabel = useCallback((channel: FollowedChannelRailItem) => {
    const channelId = (channel.broadcaster_id || '').trim();
    const cached = channelId ? followerCountByChannelId[channelId] : undefined;
    const rawCount = typeof cached === 'number'
      ? cached
      : (typeof channel.follower_count === 'number' ? channel.follower_count : undefined);
    if (typeof rawCount === 'number') {
      return rawCount.toLocaleString('ja-JP');
    }
    if (channelId && loadingFollowerChannelIds[channelId]) {
      return '取得中...';
    }
    return '不明';
  }, [followerCountByChannelId, loadingFollowerChannelIds]);

  useEffect(() => {
    if (canStartRaid) return;
    setRaidConfirmChannelId(null);
  }, [canStartRaid]);

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

  const toggleLabel = side === 'left' ? '右側へ移動' : '左側へ移動';
  const hoveredChannel = hoveredChannelId
    ? channels.find((item) => item.broadcaster_id === hoveredChannelId) ?? null
    : null;
  const closeChannelMenu = useCallback(() => {
    setOpenChannelId(null);
    setMenuAnchor(null);
    setRaidConfirmChannelId(null);
    setShoutoutingChannelId(null);
  }, []);
  const copyChannelLogin = useCallback(async (channel: FollowedChannelRailItem) => {
    const channelLogin = channel.broadcaster_login;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(channelLogin);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = channelLogin;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedChannelId(channel.broadcaster_id);
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopiedChannelId((current) => (current === channel.broadcaster_id ? null : current));
      }, 1200);
    } catch {
      setActionError('チャンネル名のコピーに失敗しました');
    }
  }, []);
  const connectChannel = useCallback((channel: FollowedChannelRailItem) => {
    onAddIrcPreview(channel.broadcaster_login);
    closeChannelMenu();
  }, [closeChannelMenu, onAddIrcPreview]);
  const startShoutout = useCallback(async (channel: FollowedChannelRailItem) => {
    setActionError('');
    setRaidConfirmChannelId(null);
    setShoutoutingChannelId(channel.broadcaster_id);
    try {
      await onStartShoutout(channel);
      closeChannelMenu();
    } catch (error: any) {
      setActionError(error?.message || '応援に失敗しました');
    } finally {
      setShoutoutingChannelId(null);
    }
  }, [closeChannelMenu, onStartShoutout]);
  const startRaid = useCallback(async (channel: FollowedChannelRailItem) => {
    if (raidConfirmChannelId !== channel.broadcaster_id) {
      setRaidConfirmChannelId(channel.broadcaster_id);
      setActionError('');
      return;
    }
    setActionError('');
    setRaidingChannelId(channel.broadcaster_id);
    try {
      await onStartRaid(channel);
      closeChannelMenu();
    } catch (error: any) {
      setActionError(error?.message || 'レイド開始に失敗しました');
    } finally {
      setRaidingChannelId(null);
    }
  }, [closeChannelMenu, onStartRaid, raidConfirmChannelId]);

  return (
    <div
      className={`hidden xl:flex fixed inset-y-0 z-[1700] bg-gray-900 ${side === 'left' ? 'left-0 flex-row' : 'right-0 flex-row-reverse'}`}
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
          <div className="flex-1 overflow-y-auto space-y-2 px-1 py-1">
            {loading && (
              <div className="flex w-full justify-center py-1 text-[10px] text-gray-400">...</div>
            )}
            {!loading && channels.length === 0 && (
              <div className="flex w-full justify-center py-1 text-[10px] text-gray-500">--</div>
            )}
            {channels.map((channel) => {
              const selected = openChannelId === channel.broadcaster_id;
              const channelDisplayName = channel.broadcaster_name || channel.broadcaster_login;
              const channelLogin = channel.broadcaster_login;
              const followerCountLabel = resolveFollowerCountLabel(channel);
              const normalizedChannelLogin = channelLogin.trim().toLowerCase();
              const alreadyConnected = ircConnectedChannels.includes(normalizedChannelLogin);
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
                        setShoutoutingChannelId(null);
                        return;
                      }
                      const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const menuWidth = channel.is_live ? 340 : 192;
                      const menuHeight = channel.is_live ? 420 : 230;
                      const top = Math.max(
                        12,
                        Math.min(window.innerHeight - menuHeight - 12, rect.top + (rect.height / 2) - (menuHeight / 2)),
                      );
                      const left = side === 'left'
                        ? Math.min(window.innerWidth - menuWidth - 12, rect.right + 8)
                        : Math.max(12, rect.left - menuWidth - 8);
                      setMenuAnchor({ top, left, width: menuWidth });
                      void ensureFollowerCount(channel);
                    }}
                    className={`relative h-9 w-9 rounded-full border transition ${
                      selected
                        ? 'border-blue-400 ring-1 ring-blue-400/60'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                    onMouseEnter={(event) => {
                      const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setHoveredChannelId(channel.broadcaster_id);
                      setHoverAnchor({
                        top: rect.top + (rect.height / 2),
                        left: side === 'left' ? rect.right + 8 : rect.left - 8,
                      });
                      void ensureFollowerCount(channel);
                    }}
                    onMouseMove={(event) => {
                      const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setHoveredChannelId(channel.broadcaster_id);
                      setHoverAnchor({
                        top: rect.top + (rect.height / 2),
                        left: side === 'left' ? rect.right + 8 : rect.left - 8,
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredChannelId((current) => (current === channel.broadcaster_id ? null : current));
                      setHoverAnchor(null);
                    }}
                    aria-label={`${channelDisplayName} の操作を開く`}
                    data-followed-trigger="true"
                  >
                    <span className="block h-full w-full overflow-hidden rounded-full">
                      {channel.profile_image_url ? (
                        <img
                          src={channel.profile_image_url}
                          alt={channelDisplayName}
                          className={`h-full w-full object-cover ${channel.is_live ? '' : 'grayscale opacity-70'}`}
                        />
                      ) : (
                        <span className={`flex h-full w-full items-center justify-center bg-gray-700 text-xs font-semibold ${channel.is_live ? 'text-white' : 'text-gray-300'}`}>
                          {(channelDisplayName || '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    {channel.is_live && (
                      <span className="absolute -bottom-1 left-1/2 z-10 min-w-[16px] -translate-x-1/2 rounded-full border border-gray-900 bg-red-600 px-[2px] py-[2px] text-center text-[8px] font-bold leading-none text-white shadow">
                        {formatViewerCount(channel.viewer_count)}
                      </span>
                    )}
                  </button>
                  {selected && menuAnchor && (
                    <FollowedChannelPopover
                      channel={channel}
                      followerCountLabel={followerCountLabel}
                      alreadyConnected={alreadyConnected}
                      canStartRaid={canStartRaid}
                      copiedChannelId={copiedChannelId}
                      raidConfirmChannelId={raidConfirmChannelId}
                      raidingChannelId={raidingChannelId}
                      shoutoutingChannelId={shoutoutingChannelId}
                      actionError={actionError}
                      style={{
                        left: `${menuAnchor.left}px`,
                        top: `${menuAnchor.top}px`,
                        width: `${menuAnchor.width}px`,
                      }}
                      onCopyChannelLogin={copyChannelLogin}
                      onConnect={connectChannel}
                      onStartShoutout={startShoutout}
                      onStartRaid={startRaid}
                      onCancelRaidConfirm={() => setRaidConfirmChannelId(null)}
                    />
                  )}
                </div>
              );
            })}
            {hoveredChannel && hoverAnchor && (
              <div
                className={`pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-100 shadow ${
                  side === 'left' ? '' : '-translate-x-full'
                }`}
                style={{ top: `${hoverAnchor.top}px`, left: `${hoverAnchor.left}px` }}
              >
                <div className="font-semibold leading-tight">
                  {hoveredChannel.broadcaster_name || hoveredChannel.broadcaster_login}
                </div>
                <div className="text-[10px] leading-tight text-gray-300">#{hoveredChannel.broadcaster_login}</div>
                <div className="text-[10px] leading-tight text-gray-300">{`フォロワー: ${resolveFollowerCountLabel(hoveredChannel)}`}</div>
                {hoveredChannel.is_live && hoveredChannel.title && (
                  <div className="mt-1 text-[10px] leading-tight text-gray-200">{hoveredChannel.title}</div>
                )}
                {hoveredChannel.is_live && hoveredChannel.game_name && (
                  <div className="text-[10px] leading-tight text-gray-300">{hoveredChannel.game_name}</div>
                )}
              </div>
            )}
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
  cardMenuItems: WorkspaceCardMenuItem[];
  onAddCard: (kind: WorkspaceCardKind) => void;
  onAddIrcPreview: (channelLogin: string) => void;
  canAddCard: (kind: WorkspaceCardKind) => boolean;
  ircChannelDisplayNames: Record<string, string>;
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
  cardMenuItems,
  onAddCard,
  onAddIrcPreview,
  canAddCard,
  ircChannelDisplayNames,
}) => {
  const { status: micStatus } = useMicCaptionStatus();
  const [openPanel, setOpenPanel] = useState<'system' | 'mic' | null>(null);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [cardMenuHoveredCategory, setCardMenuHoveredCategory] = useState<WorkspaceMenuCategory>('preview');
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(() => readIrcChannels());
  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const micTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const micPanelRef = useRef<HTMLDivElement | null>(null);
  const cardMenuPanelRef = useRef<HTMLDivElement | null>(null);
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
  const cardMenuItemsByCategory = useMemo(() => {
    const grouped: Record<WorkspaceMenuCategory, WorkspaceCardMenuItem[]> = {
      preview: [],
      general: [],
      mic: [],
      twitch: [],
      printer: [],
      music: [],
      overlay: [],
      cache: [],
      system: [],
    };
    for (const item of cardMenuItems) {
      grouped[resolveWorkspaceMenuCategory(item.kind)].push(item);
    }
    return WORKSPACE_MENU_CATEGORY_ORDER
      .map((category) => ({
        category,
        label: WORKSPACE_MENU_CATEGORY_LABELS[category],
        items: grouped[category],
      }))
      .filter((group) => group.items.length > 0);
  }, [cardMenuItems]);
  const activeCardMenuGroup = useMemo(
    () => cardMenuItemsByCategory.find((group) => group.category === cardMenuHoveredCategory) ?? cardMenuItemsByCategory[0],
    [cardMenuHoveredCategory, cardMenuItemsByCategory],
  );
  const normalizeCardMenuItemLabel = useCallback((label: string) => (
    label.replace(/^[^:：]+[:：]\s*/, '')
  ), []);

  useEffect(() => {
    if (!cardMenuOpen) return;
    if (cardMenuItemsByCategory.length === 0) return;
    if (cardMenuItemsByCategory.some((group) => group.category === cardMenuHoveredCategory)) return;
    setCardMenuHoveredCategory(cardMenuItemsByCategory[0].category);
  }, [cardMenuHoveredCategory, cardMenuItemsByCategory, cardMenuOpen]);

  useEffect(() => {
    if (!openPanel) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (systemTriggerRef.current?.contains(target)) return;
      if (micTriggerRef.current?.contains(target)) return;
      if (cardMenuTriggerRef.current?.contains(target)) return;
      if (systemPanelRef.current?.contains(target)) return;
      if (micPanelRef.current?.contains(target)) return;
      if (cardMenuPanelRef.current?.contains(target)) return;
      setOpenPanel(null);
      setCardMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
        setCardMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!cardMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (cardMenuTriggerRef.current?.contains(target)) return;
      if (cardMenuPanelRef.current?.contains(target)) return;
      setCardMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCardMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [cardMenuOpen]);

  useEffect(() => {
    return subscribeIrcChannels((channels) => {
      setIrcConnectedChannels(channels);
    });
  }, []);

  const micStateLabel = !micStatus.speechSupported
    ? '非対応'
    : micStatus.recState === 'running'
      ? '実行中'
      : micStatus.recState === 'starting'
        ? '起動中'
        : '停止';

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[1700] h-12 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm xl:left-[var(--settings-topbar-left)] xl:right-[var(--settings-topbar-right)]"
      style={{
        '--settings-topbar-left': `${leftOffset}px`,
        '--settings-topbar-right': `${rightOffset}px`,
      } as React.CSSProperties}
    >
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              ref={systemTriggerRef}
              type="button"
              onClick={() => setOpenPanel((prev) => (prev === 'system' ? null : 'system'))}
              className="inline-flex h-8 items-center gap-3 rounded-md border border-gray-700 bg-gray-900/70 px-3 hover:bg-gray-800"
              aria-expanded={openPanel === 'system'}
              aria-label="システム状態を表示"
            >
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

        <div className="relative">
          <button
            ref={cardMenuTriggerRef}
            type="button"
            onClick={() => setCardMenuOpen((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900/70 text-gray-200 hover:bg-gray-800"
            aria-expanded={cardMenuOpen}
            aria-label="設定カードを追加"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {cardMenuOpen && (
            <div
              ref={cardMenuPanelRef}
              className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-[34rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl"
            >
              <div className="mb-1 px-1 text-[11px] text-gray-400">作業領域へ追加</div>
              <div className="flex gap-2">
                <div className="w-28 shrink-0 space-y-1">
                  {cardMenuItemsByCategory.map((group) => {
                    const isActive = activeCardMenuGroup?.category === group.category;
                    return (
                      <button
                        key={group.category}
                        type="button"
                        onMouseEnter={() => setCardMenuHoveredCategory(group.category)}
                        onFocus={() => setCardMenuHoveredCategory(group.category)}
                        onClick={() => setCardMenuHoveredCategory(group.category)}
                        className={`flex h-8 w-full items-center justify-between rounded border px-2 text-left text-xs transition ${
                          isActive
                            ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                            : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        <span className="truncate">{group.label}</span>
                        <span className="text-[10px] text-gray-400">▶</span>
                      </button>
                    );
                  })}
                </div>
                <div className="min-w-0 flex-1 rounded border border-gray-700/80 bg-black/10 p-1">
                  <div className="mb-1 px-1 text-[11px] text-gray-400">{activeCardMenuGroup?.label ?? '-'}</div>
                  <div className="space-y-1">
                    {(activeCardMenuGroup?.items ?? []).map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        disabled={!canAddCard(item.kind)}
                        onClick={() => {
                          if (!canAddCard(item.kind)) return;
                          onAddCard(item.kind);
                          setCardMenuOpen(false);
                        }}
                        className="flex w-full items-start rounded border border-gray-700 px-2 py-1.5 text-left hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <div>
                          <div className="text-xs text-gray-100">
                            {normalizeCardMenuItemLabel(item.label)}
                            {!canAddCard(item.kind) ? ' (配置済み)' : ''}
                          </div>
                          <div className="text-[11px] text-gray-400">{item.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-gray-700 pt-2">
                <div className="mb-1 px-1 text-[11px] text-gray-400">コメント欄接続中から追加</div>
                <div className="space-y-1">
                  {ircConnectedChannels.length === 0 && (
                    <div className="px-1 text-[11px] text-gray-500">接続中のIRCチャンネルはありません</div>
                  )}
                  {ircConnectedChannels.map((channel) => {
                    const kind = `preview-irc:${channel}` as WorkspaceCardKind;
                    const disabled = !canAddCard(kind);
                    const displayName = (ircChannelDisplayNames[channel] || '').trim();
                    return (
                      <button
                        key={channel}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          onAddIrcPreview(channel);
                          setCardMenuOpen(false);
                        }}
                        className="flex h-8 w-full items-center justify-between rounded border border-gray-700 px-2 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="truncate text-left">
                          {displayName ? `${displayName} (#${channel})` : `#${channel}`}
                        </span>
                        <span className="text-[11px] text-gray-400">{disabled ? '配置済み' : '追加'}</span>
                      </button>
                    );
                  })}
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
  const initialWorkspaceFlow = useMemo(() => readWorkspaceFlow(), []);
  const initialWorkspaceCardLastPositions = useMemo(() => readWorkspaceCardLastPositions(), []);
  const initialPreviewExpandState = useMemo(() => readWorkspacePreviewExpandState(), []);
  const [workspaceSnapEnabled, setWorkspaceSnapEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(WORKSPACE_SNAP_ENABLED_STORAGE_KEY);
    return stored == null ? true : stored !== 'false';
  });
  const initialWorkspace = useMemo(() => {
    if (initialWorkspaceFlow && initialWorkspaceFlow.nodes.length > 0) return initialWorkspaceFlow.nodes;
    return [
      createWorkspaceNode('preview-main', { x: 140, y: 120 }),
      createWorkspaceNode('general-basic', { x: 860, y: 120 }),
    ];
  }, [initialWorkspaceFlow]);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<WorkspaceCardNode>(initialWorkspace);
  const [workspaceViewport, setWorkspaceViewport] = useState<Viewport | null>(() => initialWorkspaceFlow?.viewport ?? null);
  const [previewReloadNonceByKind, setPreviewReloadNonceByKind] = useState<Record<string, number>>({});
  const [previewWarningByKind, setPreviewWarningByKind] = useState<Partial<Record<WorkspaceCardKind, string>>>({});
  const [expandedPreviewNodeId, setExpandedPreviewNodeId] = useState<string | null>(() => initialPreviewExpandState.expandedNodeId);
  const [chatSidebarActiveTabRequest, setChatSidebarActiveTabRequest] = useState<{ tabId: string; requestId: number } | null>(null);
  const [activeChatSidebarTabId, setActiveChatSidebarTabId] = useState<string>(PRIMARY_CHAT_TAB_ID);
  const [panningSettingsOpen, setPanningSettingsOpen] = useState(false);
  const [isWorkspaceControlsVisible, setIsWorkspaceControlsVisible] = useState(false);
  const [isQuickControlsHovered, setIsQuickControlsHovered] = useState(false);
  const [isPanKeyActive, setIsPanKeyActive] = useState(false);
  const [isZoomActivationKeyActive, setIsZoomActivationKeyActive] = useState(false);
  const [previewInteractionKind, setPreviewInteractionKind] = useState<WorkspaceCardKind | null>(null);
  const workspaceShellRef = useRef<HTMLDivElement | null>(null);
  const quickControlsHideTimerRef = useRef<number | null>(null);
  const shouldFitWorkspaceOnInitRef = useRef(initialWorkspaceFlow?.viewport == null);
  const workspaceFlowInstanceRef = useRef<ReactFlowInstance<WorkspaceCardNode> | null>(null);
  const lastWorkspaceCardPositionRef =
    useRef<Partial<Record<WorkspaceCardKind, { x: number; y: number }>>>(initialWorkspaceCardLastPositions);
  const expandedPreviewNodeIdRef = useRef<string | null>(initialPreviewExpandState.expandedNodeId);
  const previewExpandSnapshotRef = useRef<Record<string, PreviewViewportExpandSnapshot>>(initialPreviewExpandState.snapshots);

  const onNodesChange = useCallback((changes: NodeChange<WorkspaceCardNode>[]) => {
    onNodesChangeRaw(changes);
    const expandedNodeId = expandedPreviewNodeIdRef.current;
    if (!expandedNodeId) return;
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (node.id !== expandedNodeId) return node;
        const styleZIndex = toFiniteNumber(
          (node.style as Record<string, unknown> | undefined)?.zIndex,
          Number.NaN,
        );
        const hasExpandedNodeZIndex = node.zIndex === PREVIEW_NODE_EXPANDED_Z_INDEX;
        const hasExpandedStyleZIndex = Number.isFinite(styleZIndex) && styleZIndex === PREVIEW_NODE_EXPANDED_Z_INDEX;
        if (hasExpandedNodeZIndex && hasExpandedStyleZIndex) return node;
        changed = true;
        return {
          ...node,
          zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
          style: {
            ...(node.style ?? {}),
            zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
          },
        };
      });
      return changed ? next : current;
    });
  }, [onNodesChangeRaw, setNodes]);

  const {
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
  const panActivationKeyCode = getSettingValue('WORKSPACE_PAN_ACTIVATION_KEY') || 'Space';
  const zoomActivationKeyCode = normalizeWorkspaceZoomActivationKeyCode(getSettingValue('WORKSPACE_ZOOM_MODIFIER_KEY') || 'Control');
  const scrollModeSettingValue = getSettingValue('WORKSPACE_SCROLL_MODE_ENABLED');
  const scrollModeEnabled = (scrollModeSettingValue || getSettingValue('WORKSPACE_PAN_ON_SCROLL')) === 'true';
  const previewPortalEnabled = getSettingValue('WORKSPACE_PREVIEW_PORTAL_ENABLED') === 'true';

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

  const deactivatePreviewInteraction = useCallback(() => {
    setPreviewInteractionKind(null);
  }, []);

  const activatePreviewInteraction = useCallback((kind: WorkspaceCardKind) => {
    if (!scrollModeEnabled) return;
    setPreviewInteractionKind(kind);
  }, [scrollModeEnabled]);

  const handleWorkspaceMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setWorkspaceViewport(normalizeWorkspaceViewport(viewport));
  }, []);

  const handleWorkspaceMoveStart = useCallback(() => {
    if (!scrollModeEnabled) return;
    deactivatePreviewInteraction();
  }, [deactivatePreviewInteraction, scrollModeEnabled]);

  const handleWorkspaceMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (quickControlsHideTimerRef.current !== null) {
      window.clearTimeout(quickControlsHideTimerRef.current);
      quickControlsHideTimerRef.current = null;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const fromLeft = event.clientX - rect.left;
    const fromBottom = rect.bottom - event.clientY;
    const nearLeftBottom = fromLeft <= WORKSPACE_CONTROLS_PROXIMITY_PX && fromBottom <= WORKSPACE_CONTROLS_PROXIMITY_PX;
    setIsWorkspaceControlsVisible((current) => (current === nearLeftBottom ? current : nearLeftBottom));
  }, []);

  const handleWorkspaceMouseLeave = useCallback(() => {
    if (quickControlsHideTimerRef.current !== null) {
      window.clearTimeout(quickControlsHideTimerRef.current);
    }
    quickControlsHideTimerRef.current = window.setTimeout(() => {
      setIsWorkspaceControlsVisible(false);
      quickControlsHideTimerRef.current = null;
    }, QUICK_CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (quickControlsHideTimerRef.current !== null) {
        window.clearTimeout(quickControlsHideTimerRef.current);
      }
    };
  }, []);

  const handleWorkspaceFlowInit = useCallback((instance: ReactFlowInstance<WorkspaceCardNode>) => {
    workspaceFlowInstanceRef.current = instance;
    if (!shouldFitWorkspaceOnInitRef.current) return;
    shouldFitWorkspaceOnInitRef.current = false;
    window.requestAnimationFrame(() => {
      // Twitch autoplay requires a visible minimum area; avoid initial zoom-out below 1x.
      void instance.fitView({ minZoom: 1, maxZoom: 1 });
    });
  }, []);

  const resolveWorkspaceCardSpawnPosition = useCallback((kind: WorkspaceCardKind, existingNodes: WorkspaceCardNode[]) => {
    const existingCount = existingNodes.length;
    const remembered = lastWorkspaceCardPositionRef.current[kind];
    if (remembered) {
      return findAvailableWorkspaceCardPosition(kind, remembered, existingNodes);
    }

    const offset = existingCount * 36;
    const fallback = {
      x: 160 + (offset % 720),
      y: 120 + Math.floor(offset / 6) * 52,
    };

    const instance = workspaceFlowInstanceRef.current;
    if (!instance || typeof window === 'undefined') {
      return findAvailableWorkspaceCardPosition(kind, fallback, existingNodes);
    }

    try {
      const base = instance.screenToFlowPosition({
        x: Math.max(0, Math.floor(window.innerWidth / 2)),
        y: Math.max(0, Math.floor(window.innerHeight / 2)),
      });
      const size = resolveWorkspaceCardSize(kind);
      const shift = (existingCount % 6) * 24;
      return findAvailableWorkspaceCardPosition(kind, {
        x: base.x - (size.width / 2) + shift,
        y: base.y - (size.height / 2) + Math.floor(existingCount / 6) * 24,
      }, existingNodes);
    } catch {
      return findAvailableWorkspaceCardPosition(kind, fallback, existingNodes);
    }
  }, []);

  const connectIrcChannel = useCallback((channelLogin: string) => {
    const normalized = (channelLogin || '').trim().toLowerCase();
    if (!normalized) return;
    const current = readIrcChannels();
    if (!current.includes(normalized)) {
      writeIrcChannels([...current, normalized]);
    }
  }, []);

  const addIrcPreviewCard = useCallback((channelLogin: string) => {
    const normalized = (channelLogin || '').trim().toLowerCase();
    if (!normalized) return;
    connectIrcChannel(normalized);
    const previewKind = `preview-irc:${normalized}` as WorkspaceCardKind;
    setNodes((existing) => {
      if (existing.some((node) => node.data.kind === previewKind)) return existing;
      const position = resolveWorkspaceCardSpawnPosition(previewKind, existing);
      const created = createWorkspaceNode(previewKind, position);
      return reorderPreviewNodesForFront(
        [...existing, created],
        created.id,
        expandedPreviewNodeIdRef.current,
      );
    });
  }, [connectIrcChannel, resolveWorkspaceCardSpawnPosition, setNodes]);

  const startRaidToChannel = async (channel: FollowedChannelRailItem) => {
    if (!streamStatus?.is_live) {
      throw new Error('配信中のみレイドできます');
    }
    const targetChannelLogin = (channel.broadcaster_login || '').trim().toLowerCase();
    if (!targetChannelLogin) {
      throw new Error('レイド先チャンネルが不正です');
    }

    const response = await fetch(buildApiUrl('/api/twitch/raid/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_channel_login: targetChannelLogin,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || payload?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
  };

  const startShoutoutToChannel = async (channel: FollowedChannelRailItem) => {
    if (!streamStatus?.is_live) {
      throw new Error('配信中のみ応援できます');
    }
    if (!channel.is_live) {
      throw new Error('LIVE中のチャンネルのみ応援できます');
    }
    const targetChannelLogin = (channel.broadcaster_login || '').trim().toLowerCase();
    if (!targetChannelLogin) {
      throw new Error('応援先チャンネルが不正です');
    }

    const response = await fetch(buildApiUrl('/api/twitch/shoutout/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_channel_login: targetChannelLogin,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || payload?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
  };

  const cardMenuItems = useMemo<WorkspaceCardMenuItem[]>(() => BASE_WORKSPACE_MENU, []);
  const railReservedWidth = FOLLOWED_RAIL_WIDTH_PX + chatSidebarWidth;
  const ircChannelDisplayNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const channel of followedChannels) {
      const login = (channel.broadcaster_login || '').trim().toLowerCase();
      const displayName = (channel.broadcaster_name || '').trim();
      if (!login || !displayName) continue;
      names[login] = displayName;
    }
    return names;
  }, [followedChannels]);
  const topBarOffsets = useMemo(() => ({
    left: followedRailSide === 'left' ? railReservedWidth : 0,
    right: followedRailSide === 'right' ? railReservedWidth : 0,
  }), [followedRailSide, railReservedWidth]);

  useEffect(() => {
    if (!scrollModeEnabled) {
      deactivatePreviewInteraction();
    }
  }, [deactivatePreviewInteraction, scrollModeEnabled]);

  const activePreviewNodeId = useMemo(() => {
    if (!previewInteractionKind) return null;
    return nodes.find((node) => node.data.kind === previewInteractionKind)?.id ?? null;
  }, [nodes, previewInteractionKind]);

  useEffect(() => {
    if (!scrollModeEnabled || !activePreviewNodeId) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const nodeElement = Array
        .from(window.document.querySelectorAll<HTMLElement>('.settings-workspace-flow .react-flow__node'))
        .find((element) => element.dataset.id === activePreviewNodeId);
      if (!nodeElement) {
        deactivatePreviewInteraction();
        return;
      }
      const rect = nodeElement.getBoundingClientRect();
      const insideNode =
        event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      if (!insideNode) {
        deactivatePreviewInteraction();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
    };
  }, [activePreviewNodeId, deactivatePreviewInteraction, scrollModeEnabled]);

  useEffect(() => {
    if (!scrollModeEnabled) return undefined;
    const handleWheelCapture = (event: WheelEvent) => {
      const container = workspaceShellRef.current;
      if (!(event.target instanceof Node) || !container?.contains(event.target)) return;
      if (!event.cancelable) return;
      // Prevent browser-level back/forward swipe while preserving ReactFlow pan handling.
      event.preventDefault();
    };
    window.addEventListener('wheel', handleWheelCapture, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheelCapture, true);
    };
  }, [scrollModeEnabled]);

  useEffect(() => {
    setIsPanKeyActive(false);
    setIsZoomActivationKeyActive(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === panActivationKeyCode) {
        setIsPanKeyActive(true);
      }
      setIsZoomActivationKeyActive(isZoomActivationPressed(event, zoomActivationKeyCode));
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === panActivationKeyCode) {
        setIsPanKeyActive(false);
      }
      setIsZoomActivationKeyActive(isZoomActivationPressed(event, zoomActivationKeyCode));
    };
    const handleWindowBlur = () => {
      setIsPanKeyActive(false);
      setIsZoomActivationKeyActive(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [panActivationKeyCode, zoomActivationKeyCode]);

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
    void verifyTwitchConfig({ suppressSuccessToast: true });
  }, [
    featureStatus?.twitch_configured,
    authStatus?.authenticated,
    twitchUserInfo,
    verifyingTwitch,
    verifyTwitchConfig,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FOLLOWED_RAIL_SIDE_STORAGE_KEY, followedRailSide);
  }, [followedRailSide]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WORKSPACE_SNAP_ENABLED_STORAGE_KEY, workspaceSnapEnabled ? 'true' : 'false');
  }, [workspaceSnapEnabled]);

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
        const response = await fetch(
          buildApiUrl(`/api/twitch/followed-channels?limit=${FOLLOWED_RAIL_FETCH_LIMIT}&_ts=${Date.now()}`),
          {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const data = Array.isArray(payload?.data) ? payload.data : [];
        const normalized: FollowedChannelRailItem[] = data.map((item: any) => {
          const viewerCount = Number(item.viewer_count ?? item.viewerCount ?? 0) || 0;
          const followerCount = typeof item.follower_count === 'number'
            ? item.follower_count
            : (typeof item.followerCount === 'number' ? item.followerCount : undefined);
          const startedAt = typeof item.started_at === 'string'
            ? item.started_at
            : typeof item.startedAt === 'string'
              ? item.startedAt
              : undefined;
          const liveFlag = item.is_live ?? item.isLive;
          const isLive = typeof liveFlag === 'boolean'
            ? liveFlag
            : viewerCount > 0 || Boolean(startedAt);
          const lastBroadcastAt = typeof item.last_broadcast_at === 'string'
            ? item.last_broadcast_at
            : undefined;
          return {
            broadcaster_id: String(item.broadcaster_id ?? item.id ?? ''),
            broadcaster_login: String(item.broadcaster_login ?? item.login ?? ''),
            broadcaster_name: String(item.broadcaster_name ?? item.display_name ?? item.login ?? ''),
            profile_image_url: String(item.profile_image_url ?? ''),
            followed_at: typeof item.followed_at === 'string' ? item.followed_at : undefined,
            is_live: isLive,
            viewer_count: viewerCount,
            follower_count: followerCount,
            title: typeof item.title === 'string' ? item.title : undefined,
            game_name: typeof item.game_name === 'string' ? item.game_name : undefined,
            started_at: startedAt,
            last_broadcast_at: lastBroadcastAt,
          };
        }).filter((item) => item.broadcaster_id && item.broadcaster_login);

        normalized.sort((a, b) => {
          if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
          if (a.viewer_count !== b.viewer_count) return b.viewer_count - a.viewer_count;
          const aDate = a.last_broadcast_at ?? '';
          const bDate = b.last_broadcast_at ?? '';
          if (aDate !== bDate) return bDate.localeCompare(aDate);
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
    return subscribeIrcChannels((channels) => {
      const connected = new Set(
        channels
          .map((channel) => channel.trim().toLowerCase())
          .filter((channel) => channel !== ''),
      );
      setNodes((current) => {
        const removedNodes = current.filter((node) => (
          isPreviewIrcKind(node.data.kind)
          && !connected.has(node.data.kind.slice('preview-irc:'.length).trim().toLowerCase())
        ));
        if (removedNodes.length === 0) return current;

        const removedIds = new Set(removedNodes.map((node) => node.id));
        const nextPositions = { ...lastWorkspaceCardPositionRef.current };
        for (const node of removedNodes) {
          nextPositions[node.data.kind] = {
            x: node.position.x,
            y: node.position.y,
          };
        }
        lastWorkspaceCardPositionRef.current = nextPositions;
        writeWorkspaceCardLastPositions(nextPositions);

        return current.filter((node) => !removedIds.has(node.id));
      });
    });
  }, [setNodes]);

  const addWorkspaceCard = useCallback((kind: WorkspaceCardKind) => {
    setNodes((current) => {
      if (current.some((node) => node.data.kind === kind)) {
        return current;
      }
      const position = resolveWorkspaceCardSpawnPosition(kind, current);
      const created = createWorkspaceNode(kind, position);
      const next = [...current, created];
      if (!isPreviewCardKind(kind)) return next;
      return reorderPreviewNodesForFront(next, created.id, expandedPreviewNodeIdRef.current);
    });
  }, [resolveWorkspaceCardSpawnPosition, setNodes]);

  const canAddCard = useCallback((kind: WorkspaceCardKind) => {
    return !nodes.some((node) => node.data.kind === kind);
  }, [nodes]);

  const removeWorkspaceCard = useCallback((id: string) => {
    if (expandedPreviewNodeIdRef.current === id) {
      expandedPreviewNodeIdRef.current = null;
      setExpandedPreviewNodeId(null);
    }
    delete previewExpandSnapshotRef.current[id];
    setNodes((current) => {
      const target = current.find((node) => node.id === id);
      if (target) {
        const nextPositions = {
          ...lastWorkspaceCardPositionRef.current,
          [target.data.kind]: {
            x: target.position.x,
            y: target.position.y,
          },
        };
        lastWorkspaceCardPositionRef.current = nextPositions;
        writeWorkspaceCardLastPositions(nextPositions);
        if (isPreviewIrcKind(target.data.kind)) {
          const channelLogin = target.data.kind.slice('preview-irc:'.length).trim().toLowerCase();
          if (channelLogin) {
            const currentChannels = readIrcChannels();
            const nextChannels = currentChannels.filter((channel) => channel !== channelLogin);
            if (nextChannels.length !== currentChannels.length) {
              writeIrcChannels(nextChannels);
            }
          }
        }
      }
      return current.filter((node) => node.id !== id);
    });
  }, [setNodes]);

  const snapWorkspaceCardSize = useCallback((id: string, width: number, height: number) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== id) return node;
      const minSize = resolveWorkspaceCardMinSize(node.data.kind);
      const snappedWidth = workspaceSnapEnabled
        ? Math.max(minSize.minWidth, Math.round(width / WORKSPACE_SNAP_GRID[0]) * WORKSPACE_SNAP_GRID[0])
        : Math.max(minSize.minWidth, Math.round(width));
      const snappedHeight = workspaceSnapEnabled
        ? Math.max(minSize.minHeight, Math.round(height / WORKSPACE_SNAP_GRID[1]) * WORKSPACE_SNAP_GRID[1])
        : Math.max(minSize.minHeight, Math.round(height));
      if (node.width === snappedWidth && node.height === snappedHeight) return node;
      return {
        ...node,
        width: snappedWidth,
        height: snappedHeight,
        style: {
          ...(node.style ?? {}),
          width: snappedWidth,
          height: snappedHeight,
        },
      };
    }));
  }, [setNodes, workspaceSnapEnabled]);

  const togglePreviewViewportExpand = useCallback((id: string) => {
    let next = nodes;
    let changed = false;
    const snapshots = previewExpandSnapshotRef.current;
    const currentlyExpandedId = expandedPreviewNodeIdRef.current;

    const restoreExpandedNode = (restoreId: string) => {
      const snapshot = snapshots[restoreId];
      if (!snapshot) return;
      let restored = false;
      next = next.map((node) => {
        if (node.id !== restoreId) return node;
        restored = true;
        const restoredStyle = {
          ...(node.style ?? {}),
          width: snapshot.width,
          height: snapshot.height,
        } as Record<string, unknown>;
        delete restoredStyle.zIndex;
        return {
          ...node,
          position: {
            x: snapshot.position.x,
            y: snapshot.position.y,
          },
          width: snapshot.width,
          height: snapshot.height,
          zIndex: Number.isFinite(toFiniteNumber(snapshot.zIndex, Number.NaN))
            ? toFiniteNumber(snapshot.zIndex, Number.NaN)
            : undefined,
          style: restoredStyle,
        };
      });
      if (restored) changed = true;
      delete snapshots[restoreId];
    };

    if (currentlyExpandedId === id) {
      restoreExpandedNode(currentlyExpandedId);
      if (!changed) {
        next = next.map((node) => {
          if (node.id !== currentlyExpandedId) return node;
          changed = true;
          const fallback = resolveWorkspaceCardSize(node.data.kind);
          const restoredStyle = {
            ...(node.style ?? {}),
            width: fallback.width,
            height: fallback.height,
          } as Record<string, unknown>;
          delete restoredStyle.zIndex;
          return {
            ...node,
            width: fallback.width,
            height: fallback.height,
            zIndex: undefined,
            style: restoredStyle,
          };
        });
      }
      delete snapshots[currentlyExpandedId];
      expandedPreviewNodeIdRef.current = null;
      setExpandedPreviewNodeId(null);
      if (changed) setNodes(next);
      return;
    }

    if (currentlyExpandedId) {
      restoreExpandedNode(currentlyExpandedId);
      if (!changed) {
        next = next.map((node) => {
          if (node.id !== currentlyExpandedId) return node;
          changed = true;
          const fallback = resolveWorkspaceCardSize(node.data.kind);
          const restoredStyle = {
            ...(node.style ?? {}),
            width: fallback.width,
            height: fallback.height,
          } as Record<string, unknown>;
          delete restoredStyle.zIndex;
          return {
            ...node,
            width: fallback.width,
            height: fallback.height,
            zIndex: undefined,
            style: restoredStyle,
          };
        });
      }
      delete snapshots[currentlyExpandedId];
      expandedPreviewNodeIdRef.current = null;
      setExpandedPreviewNodeId(null);
    }

    const flowInstance = workspaceFlowInstanceRef.current;
    if (!flowInstance || typeof window === 'undefined') {
      if (changed) setNodes(next);
      return;
    }
    const flowElement = window.document.querySelector('.settings-workspace-flow') as HTMLElement | null;
    if (!flowElement) {
      if (changed) setNodes(next);
      return;
    }
    const viewportRect = flowElement.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) {
      if (changed) setNodes(next);
      return;
    }

    const target = next.find((node) => node.id === id);
    if (!target || !isPreviewCardKind(target.data.kind)) {
      if (changed) setNodes(next);
      return;
    }

    const currentWidth = toFiniteNumber(
      target.width,
      toFiniteNumber(
        target.measured?.width,
        toFiniteNumber((target.style as Record<string, unknown> | undefined)?.width, resolveWorkspaceCardSize(target.data.kind).width),
      ),
    );
    const currentHeight = toFiniteNumber(
      target.height,
      toFiniteNumber(
        target.measured?.height,
        toFiniteNumber((target.style as Record<string, unknown> | undefined)?.height, resolveWorkspaceCardSize(target.data.kind).height),
      ),
    );
    const contentHeight = Math.max(currentHeight - PREVIEW_NODE_HEADER_HEIGHT, 1);
    const contentAspect = currentWidth / contentHeight;

    const viewport = flowInstance.getViewport();
    const zoom = Math.max(toFiniteNumber(viewport.zoom, 1), 0.01);
    const maxWidth = Math.max(1, (viewportRect.width * 0.9) / zoom);
    const maxHeight = Math.max(1, (viewportRect.height * 0.9) / zoom);
    const maxContentHeight = Math.max(1, maxHeight - PREVIEW_NODE_HEADER_HEIGHT);
    let expandedWidth = maxWidth;
    let expandedContentHeight = expandedWidth / contentAspect;
    if (expandedContentHeight > maxContentHeight) {
      expandedContentHeight = maxContentHeight;
      expandedWidth = expandedContentHeight * contentAspect;
    }
    const expandedHeight = expandedContentHeight + PREVIEW_NODE_HEADER_HEIGHT;

    let flowPosition: { x: number; y: number };
    try {
      const center = flowInstance.screenToFlowPosition({
        x: viewportRect.left + (viewportRect.width / 2),
        y: viewportRect.top + (viewportRect.height / 2),
      });
      flowPosition = {
        x: center.x - (expandedWidth / 2),
        y: center.y - (expandedHeight / 2),
      };
    } catch (error) {
      console.warn('failed to calculate preview expand position', error);
      if (changed) setNodes(next);
      return;
    }

    snapshots[id] = {
      position: {
        x: target.position.x,
        y: target.position.y,
      },
      width: currentWidth,
      height: currentHeight,
      zIndex: Number.isFinite(toFiniteNumber(target.zIndex, Number.NaN))
        ? toFiniteNumber(target.zIndex, Number.NaN)
        : undefined,
    };

    next = next.map((node) => {
      if (node.id !== id) return node;
      return {
        ...node,
        position: flowPosition,
        width: expandedWidth,
        height: expandedHeight,
        zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
        style: {
          ...(node.style ?? {}),
          width: expandedWidth,
          height: expandedHeight,
          zIndex: PREVIEW_NODE_EXPANDED_Z_INDEX,
        },
      };
    });
    setNodes(next);
    expandedPreviewNodeIdRef.current = id;
    setExpandedPreviewNodeId(id);
  }, [nodes, setNodes]);

  const bringPreviewNodeToFront = useCallback((nodeId: string) => {
    setNodes((current) => reorderPreviewNodesForFront(current, nodeId, expandedPreviewNodeIdRef.current));
  }, [setNodes]);

  useEffect(() => {
    const handler = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      bringPreviewNodeToFront(nodeId);
    };
    window.addEventListener('workspace-preview-bring-to-front', handler);
    return () => window.removeEventListener('workspace-preview-bring-to-front', handler);
  }, [bringPreviewNodeToFront]);

  const isPreviewViewportExpanded = useCallback((id: string) => expandedPreviewNodeId === id, [expandedPreviewNodeId]);

  useEffect(() => {
    const expandedId = expandedPreviewNodeIdRef.current;
    const nodeIds = new Set(nodes.map((node) => node.id));
    let snapshotsChanged = false;
    for (const snapshotId of Object.keys(previewExpandSnapshotRef.current)) {
      if (nodeIds.has(snapshotId)) continue;
      delete previewExpandSnapshotRef.current[snapshotId];
      snapshotsChanged = true;
    }
    if (!expandedId) {
      if (snapshotsChanged) {
        writeWorkspacePreviewExpandState(null, previewExpandSnapshotRef.current);
      }
      return;
    }
    if (nodeIds.has(expandedId)) return;
    delete previewExpandSnapshotRef.current[expandedId];
    expandedPreviewNodeIdRef.current = null;
    setExpandedPreviewNodeId(null);
    writeWorkspacePreviewExpandState(null, previewExpandSnapshotRef.current);
  }, [nodes]);

  useEffect(() => {
    writeWorkspacePreviewExpandState(expandedPreviewNodeId, previewExpandSnapshotRef.current);
  }, [expandedPreviewNodeId, nodes]);

  const refreshPreview = useCallback((kind: WorkspaceCardKind) => {
    if (!isPreviewCardKind(kind)) return;
    setPreviewReloadNonceByKind((current) => ({
      ...current,
      [kind]: (current[kind] ?? 0) + 1,
    }));
  }, []);

  const setPreviewWarning = useCallback((kind: WorkspaceCardKind, warningMessage: string | null) => {
    setPreviewWarningByKind((current) => {
      const normalized = warningMessage?.trim() || null;
      const previous = current[kind] ?? null;
      if (previous === normalized) return current;
      if (!normalized) {
        if (!(kind in current)) return current;
        const next = { ...current };
        delete next[kind];
        return next;
      }
      return {
        ...current,
        [kind]: normalized,
      };
    });
  }, []);

  const isPreviewInteractionEnabled = useCallback((kind: WorkspaceCardKind) => {
    if (!scrollModeEnabled) return true;
    return previewInteractionKind === kind;
  }, [previewInteractionKind, scrollModeEnabled]);

  const togglePreviewInteraction = useCallback((kind: WorkspaceCardKind) => {
    if (!scrollModeEnabled) return;
    if (previewInteractionKind === kind) {
      deactivatePreviewInteraction();
      return;
    }
    activatePreviewInteraction(kind);
  }, [activatePreviewInteraction, deactivatePreviewInteraction, previewInteractionKind, scrollModeEnabled]);

  const renderWorkspaceCard = useCallback((kind: WorkspaceCardKind) => {
    const reloadNonce = previewReloadNonceByKind[kind] ?? 0;
    if (kind === 'preview-main') {
      return (
        <TwitchStreamPreview
          isTwitchConfigured={Boolean(featureStatus?.twitch_configured)}
          isAuthenticated={Boolean(authStatus?.authenticated)}
          channelLogin={twitchUserInfo?.login ?? ''}
          reloadNonce={reloadNonce}
          autoplayEnabled={previewPortalEnabled}
          interactionDisabled={!isPreviewInteractionEnabled('preview-main')}
          onWarningChange={(warningMessage) => setPreviewWarning('preview-main', warningMessage)}
        />
      );
    }
    if (isPreviewIrcKind(kind)) {
      const channelLogin = kind.slice('preview-irc:'.length);
      return (
        <AddedChannelStreamPreview
          kind={kind}
          channelLogin={channelLogin}
          reloadNonce={reloadNonce}
          autoplayEnabled={previewPortalEnabled}
          interactionDisabled={!isPreviewInteractionEnabled(kind)}
          onWarningChange={setPreviewWarning}
        />
      );
    }
    if (kind === 'general-basic' || kind === 'general-notification' || kind === 'general-font') {
      const section = kind === 'general-basic'
        ? 'basic'
        : kind === 'general-notification'
          ? 'notification'
          : 'font';
      return (
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
          sections={[section]}
        />
      );
    }
    if (kind === 'music-manager') return <MusicSettings />;
    if (kind === 'logs') return <LogsTab />;
    if (kind === 'cache-stats' || kind === 'cache-config' || kind === 'cache-actions') {
      const section = kind === 'cache-stats'
        ? 'stats'
        : kind === 'cache-config'
          ? 'config'
          : 'actions';
      return <CacheSettings sections={[section]} />;
    }
    if (kind === 'api') return <ApiTab />;
    if (kind === 'mic-speech' || kind === 'mic-overlay-display') {
      const section = kind === 'mic-speech' ? 'speech' : 'overlayDisplay';
      return (
        <SettingsPageContext.Provider value={contextValue}>
          <MicTranscriptionSettings sections={[section]} />
        </SettingsPageContext.Provider>
      );
    }
    if (kind === 'twitch-api' || kind === 'twitch-reward-groups' || kind === 'twitch-custom-rewards') {
      const section = kind === 'twitch-api'
        ? 'api'
        : kind === 'twitch-reward-groups'
          ? 'rewardGroups'
          : 'customRewards';
      return (
        <SettingsPageContext.Provider value={contextValue}>
          <TwitchSettings sections={[section]} />
        </SettingsPageContext.Provider>
      );
    }
    if (
      kind === 'printer-type' ||
      kind === 'printer-bluetooth' ||
      kind === 'printer-usb' ||
      kind === 'printer-print' ||
      kind === 'printer-clock'
    ) {
      const section = kind === 'printer-type'
        ? 'type'
        : kind === 'printer-bluetooth'
          ? 'bluetooth'
          : kind === 'printer-usb'
            ? 'usb'
            : kind === 'printer-print'
              ? 'print'
              : 'clock';
      return (
        <SettingsPageContext.Provider value={contextValue}>
          <PrinterSettings sections={[section]} />
        </SettingsPageContext.Provider>
      );
    }
    if (
      kind === 'overlay-music-player' ||
      kind === 'overlay-fax' ||
      kind === 'overlay-clock' ||
      kind === 'overlay-mic-transcript' ||
      kind === 'overlay-reward-count' ||
      kind === 'overlay-lottery'
    ) {
      const focusCard: OverlayCardKey = kind === 'overlay-music-player'
        ? 'musicPlayer'
        : kind === 'overlay-fax'
          ? 'fax'
          : kind === 'overlay-clock'
            ? 'clock'
            : kind === 'overlay-mic-transcript'
              ? 'micTranscript'
              : kind === 'overlay-reward-count'
                ? 'rewardCount'
                : 'lottery';
      return (
        <SettingsPageContext.Provider value={contextValue}>
          <OverlaySettings focusCard={focusCard} />
        </SettingsPageContext.Provider>
      );
    }
    return <div className="text-xs text-gray-400">未対応カード</div>;
  }, [
    authStatus?.authenticated,
    contextValue,
    featureStatus?.twitch_configured,
    fileInputRef,
    getBooleanValue,
    getSettingValue,
    handleDeleteFont,
    handleFontPreview,
    handleFontUpload,
    handleSettingChange,
    handleTestNotification,
    previewImage,
    previewPortalEnabled,
    isPreviewInteractionEnabled,
    previewText,
    setPreviewText,
    streamStatus,
    testingNotification,
    twitchUserInfo?.login,
    uploadingFont,
    previewReloadNonceByKind,
    setPreviewWarning,
  ]);

  const resolvePreviewHeader = useCallback((kind: WorkspaceCardKind) => {
    const normalizedActiveTabId = normalizeTwitchChannelName(activeChatSidebarTabId);
    if (kind === 'preview-main') {
      const channelLogin = twitchUserInfo?.login ?? '';
      const isLive = Boolean(streamStatus?.is_live);
      return {
        channelLogin,
        statusLabel: isLive ? `LIVE (${streamStatus?.viewer_count ?? 0})` : 'OFFLINE',
        statusClassName: isLive ? 'text-red-400' : 'text-gray-400',
        warningMessage: previewWarningByKind[kind] ?? null,
        isLinkedChatTab: activeChatSidebarTabId === PRIMARY_CHAT_TAB_ID,
      };
    }
    if (isPreviewIrcKind(kind)) {
      const previewChannel = normalizeTwitchChannelName(kind.slice('preview-irc:'.length));
      return {
        channelLogin: kind.slice('preview-irc:'.length),
        statusLabel: 'IRC',
        statusClassName: 'text-emerald-400',
        warningMessage: previewWarningByKind[kind] ?? null,
        isLinkedChatTab: !!previewChannel && previewChannel === normalizedActiveTabId,
      };
    }
    return null;
  }, [activeChatSidebarTabId, previewWarningByKind, streamStatus?.is_live, streamStatus?.viewer_count, twitchUserInfo?.login]);

  const workspaceRenderContext = useMemo<WorkspaceRenderContextValue>(() => ({
    removeCard: removeWorkspaceCard,
    refreshPreview,
    togglePreviewViewportExpand,
    isPreviewViewportExpanded,
    isPreviewInteractionEnabled,
    togglePreviewInteraction,
    previewPortalEnabled,
    snapCardSize: snapWorkspaceCardSize,
    renderCard: renderWorkspaceCard,
    resolvePreviewHeader,
  }), [
    removeWorkspaceCard,
    refreshPreview,
    togglePreviewViewportExpand,
    isPreviewViewportExpanded,
    isPreviewInteractionEnabled,
    togglePreviewInteraction,
    previewPortalEnabled,
    snapWorkspaceCardSize,
    renderWorkspaceCard,
    resolvePreviewHeader,
  ]);

  useEffect(() => {
    writeWorkspaceFlow(nodes, workspaceViewport);
  }, [nodes, workspaceViewport]);

  const handleWorkspaceNodeClick = useCallback((_event: React.MouseEvent, node: WorkspaceCardNode) => {
    if (!isPreviewCardKind(node.data.kind)) return;
    activatePreviewInteraction(node.data.kind);
    bringPreviewNodeToFront(node.id);
    const requestedTabId = node.data.kind === 'preview-main'
      ? PRIMARY_CHAT_TAB_ID
      : normalizeTwitchChannelName(node.data.kind.slice('preview-irc:'.length));
    if (!requestedTabId) return;
    setChatSidebarActiveTabRequest((current) => ({
      tabId: requestedTabId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, [activatePreviewInteraction, bringPreviewNodeToFront]);

  const shouldShowQuickControls = isWorkspaceControlsVisible || panningSettingsOpen || isQuickControlsHovered;

  return (
    <div className="min-h-screen bg-gray-900 transition-colors" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="hidden" aria-hidden="true">
        <MicCaptionSender
          variant="switch_only"
          overlaySettings={overlaySettings ?? null}
          webServerPort={webServerPort}
        />
      </div>
      <WORKSPACE_RENDER_CONTEXT.Provider value={workspaceRenderContext}>
        <div
          ref={workspaceShellRef}
          className="fixed inset-0 z-0 top-12 xl:left-[var(--rf-flow-left)] xl:right-[var(--rf-flow-right)]"
          style={{
            '--rf-flow-left': `${topBarOffsets.left}px`,
            '--rf-flow-right': `${topBarOffsets.right}px`,
          } as React.CSSProperties}
          onMouseMoveCapture={handleWorkspaceMouseMove}
          onMouseLeave={handleWorkspaceMouseLeave}
        >
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            onNodeClick={handleWorkspaceNodeClick}
            onMoveStart={handleWorkspaceMoveStart}
            onMoveEnd={handleWorkspaceMoveEnd}
            onInit={handleWorkspaceFlowInit}
            nodeTypes={WORKSPACE_NODE_TYPES}
            minZoom={WORKSPACE_FLOW_MIN_ZOOM}
            maxZoom={WORKSPACE_FLOW_MAX_ZOOM}
            snapToGrid={workspaceSnapEnabled}
            snapGrid={WORKSPACE_SNAP_GRID}
            panOnDrag={[0, 1]}
            panOnScroll={scrollModeEnabled}
            zoomOnScroll={!scrollModeEnabled}
            noWheelClassName={scrollModeEnabled ? 'nowheel-disabled' : 'nowheel'}
            panActivationKeyCode={panActivationKeyCode}
            data-pan-key-active={isPanKeyActive || isZoomActivationKeyActive ? 'true' : undefined}
            data-controls-visible={isWorkspaceControlsVisible || panningSettingsOpen ? 'true' : undefined}
            defaultViewport={workspaceViewport ?? DEFAULT_WORKSPACE_VIEWPORT}
            className="settings-workspace-flow bg-slate-950"
            colorMode="dark"
            elevateNodesOnSelect={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#334155" gap={WORKSPACE_SNAP_GRID[0]} size={1} />
          </ReactFlow>
        </div>
        <div
          className={`fixed bottom-3 z-[1700] flex flex-col overflow-hidden rounded-md border border-gray-700 bg-gray-900/90 shadow-lg transition ${
            shouldShowQuickControls
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-2 opacity-0 pointer-events-none'
          }`}
          style={{ left: `${topBarOffsets.left + 12}px` }}
          onMouseEnter={() => {
            if (quickControlsHideTimerRef.current !== null) {
              window.clearTimeout(quickControlsHideTimerRef.current);
              quickControlsHideTimerRef.current = null;
            }
            setIsQuickControlsHovered(true);
            setIsWorkspaceControlsVisible(true);
          }}
          onMouseLeave={() => {
            setIsQuickControlsHovered(false);
            if (panningSettingsOpen) return;
            if (quickControlsHideTimerRef.current !== null) {
              window.clearTimeout(quickControlsHideTimerRef.current);
            }
            quickControlsHideTimerRef.current = window.setTimeout(() => {
              setIsWorkspaceControlsVisible(false);
              quickControlsHideTimerRef.current = null;
            }, QUICK_CONTROLS_HIDE_DELAY_MS);
          }}
        >
          <button
            type="button"
            onClick={() => { void workspaceFlowInstanceRef.current?.zoomIn({ duration: 120 }); }}
            className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
            title="ズームイン"
            aria-label="ズームイン"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => { void workspaceFlowInstanceRef.current?.zoomOut({ duration: 120 }); }}
            className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
            title="ズームアウト"
            aria-label="ズームアウト"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => { void workspaceFlowInstanceRef.current?.fitView({ duration: 150 }); }}
            className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-gray-200 hover:bg-gray-800"
            title="全体表示"
            aria-label="全体表示"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceSnapEnabled((current) => !current)}
            className={`inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 hover:bg-gray-800 ${
              workspaceSnapEnabled ? 'text-emerald-300' : 'text-gray-400'
            }`}
            title={workspaceSnapEnabled ? 'スナップ: ON' : 'スナップ: OFF'}
            aria-label={workspaceSnapEnabled ? 'スナップをオフにする' : 'スナップをオンにする'}
          >
            <Magnet className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleSettingChange('WORKSPACE_SCROLL_MODE_ENABLED', !scrollModeEnabled)}
            className={`inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 hover:bg-gray-800 ${
              scrollModeEnabled ? 'text-sky-300' : 'text-gray-400'
            }`}
            title={scrollModeEnabled ? 'スクロールモード: ON' : 'スクロールモード: OFF'}
            aria-label={scrollModeEnabled ? 'スクロールモードをオフにする' : 'スクロールモードをオンにする'}
          >
            <Mouse className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanningSettingsOpen((current) => !current)}
            className={`inline-flex h-8 w-8 items-center justify-center hover:bg-gray-800 ${
              panningSettingsOpen ? 'text-blue-300' : 'text-gray-400'
            }`}
            title="パン設定"
            aria-label="パン設定を開く"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
        {panningSettingsOpen && (
          <WorkspacePanningSettings
            panActivationKeyCode={panActivationKeyCode}
            onPanActivationKeyCodeChange={(value) => handleSettingChange('WORKSPACE_PAN_ACTIVATION_KEY', value)}
            zoomActivationKeyCode={zoomActivationKeyCode}
            onZoomActivationKeyCodeChange={(value) => handleSettingChange('WORKSPACE_ZOOM_MODIFIER_KEY', value)}
            snapModeEnabled={workspaceSnapEnabled}
            onSnapModeEnabledChange={setWorkspaceSnapEnabled}
            scrollModeEnabled={scrollModeEnabled}
            onScrollModeEnabledChange={(enabled) => handleSettingChange('WORKSPACE_SCROLL_MODE_ENABLED', enabled)}
            previewPortalEnabled={previewPortalEnabled}
            onPreviewPortalEnabledChange={(enabled) => handleSettingChange('WORKSPACE_PREVIEW_PORTAL_ENABLED', enabled)}
            leftOffset={topBarOffsets.left + 52}
            onClose={() => setPanningSettingsOpen(false)}
          />
        )}

        <FollowedChannelsRail
          side={followedRailSide}
          channels={followedChannels}
          loading={followedChannelsLoading}
          error={followedChannelsError}
          canStartRaid={Boolean(streamStatus?.is_live)}
          chatWidth={chatSidebarWidth}
          chatPanel={(
            <ChatSidebar
              side={followedRailSide}
              width={chatSidebarWidth}
              onWidthChange={handleChatSidebarWidthChange}
              embedded
              channelDisplayNames={ircChannelDisplayNames}
              activeTabRequest={chatSidebarActiveTabRequest}
              onActiveTabChange={setActiveChatSidebarTabId}
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
          onAddIrcPreview={addIrcPreviewCard}
          onStartRaid={startRaidToChannel}
          onStartShoutout={startShoutoutToChannel}
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
          cardMenuItems={cardMenuItems}
          onAddCard={addWorkspaceCard}
          onAddIrcPreview={addIrcPreviewCard}
          canAddCard={canAddCard}
          ircChannelDisplayNames={ircChannelDisplayNames}
        />
      </WORKSPACE_RENDER_CONTEXT.Provider>
    </div>
  );
};
