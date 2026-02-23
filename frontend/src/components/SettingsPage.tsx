import { AlertTriangle, Bluetooth, Bug, Check, Copy, ExternalLink, FileText, Gift, HardDrive, Languages, Layers, Magnet, Menu, Mic, Music, Plus, Radio, RefreshCw, Server, Settings2, Wifi, X } from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ControlButton,
  Controls,
  NodeResizer,
  ReactFlow,
  useNodesState,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
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
import { ChatSidebar } from './ChatSidebar';
import { MicCaptionSender } from './mic/MicCaptionSender';
import { readIrcChannels, subscribeIrcChannels, writeIrcChannels } from '../utils/chatChannels';
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
const FOLLOWED_RAIL_WIDTH_PX = 48;
const FOLLOWED_RAIL_FETCH_LIMIT = 50;
const WORKSPACE_FLOW_STORAGE_KEY = 'settings.workspace.reactflow.v1';
const WORKSPACE_CARD_LAST_POSITION_STORAGE_KEY = 'settings.workspace.reactflow.last_positions.v1';
const WORKSPACE_SNAP_ENABLED_STORAGE_KEY = 'settings.workspace.reactflow.snap.enabled.v1';
const WORKSPACE_FLOW_MIN_ZOOM = 0.2;
const WORKSPACE_FLOW_MAX_ZOOM = 1.8;
const WORKSPACE_SNAP_GRID: [number, number] = [24, 24];
const DEFAULT_WORKSPACE_VIEWPORT = { x: 0, y: 0, zoom: 1 };

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

type StoredWorkspaceFlowPayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

type StoredWorkspaceCardLastPositionsPayload = Record<string, { x: number; y: number }>;

type WorkspaceRenderContextValue = {
  removeCard: (id: string) => void;
  refreshPreview: (kind: WorkspaceCardKind) => void;
  snapCardSize: (id: string, width: number, height: number) => void;
  renderCard: (kind: WorkspaceCardKind) => React.ReactNode;
  resolvePreviewHeader: (kind: WorkspaceCardKind) => {
    channelLogin: string;
    statusLabel: string;
    statusClassName: string;
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
  if (kind === 'preview-main' || isPreviewIrcKind(kind)) return snapWorkspaceSizeToGrid({ width: 640, height: 420 });
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
  options: { id?: string; width?: number; height?: number } = {},
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
};

const PreviewEmbed: React.FC<PreviewEmbedProps> = ({ channelLogin, reloadNonce }) => {
  const parentDomain = typeof window !== 'undefined'
    ? (window.location.hostname?.replace(/^tauri\./, '') || 'localhost')
    : 'localhost';
  const streamUrl = `https://player.twitch.tv/?channel=${encodeURIComponent(channelLogin)}&parent=${encodeURIComponent(parentDomain)}&autoplay=true&muted=true&controls=true&refresh=${reloadNonce}`;

  return (
    <div className="nodrag nopan nowheel h-full min-h-0 overflow-hidden bg-black">
      <iframe
        key={`${channelLogin}-${parentDomain}-${reloadNonce}`}
        src={streamUrl}
        title={`Twitch Stream Preview - ${channelLogin}`}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        scrolling="no"
      />
    </div>
  );
};

const TwitchStreamPreview: React.FC<TwitchStreamPreviewProps> = ({
  isTwitchConfigured,
  isAuthenticated,
  channelLogin,
  reloadNonce,
}) => {
  const canEmbed = Boolean(channelLogin);

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
        <PreviewEmbed channelLogin={channelLogin} reloadNonce={reloadNonce} />
      )}
    </CompactPreviewFrame>
  );
};

type AddedChannelStreamPreviewProps = {
  channelLogin: string;
  reloadNonce: number;
};

const AddedChannelStreamPreview: React.FC<AddedChannelStreamPreviewProps> = ({ channelLogin, reloadNonce }) => {
  return (
    <CompactPreviewFrame panelId={`settings.twitch.stream-preview.irc.${channelLogin}`}>
      <PreviewEmbed channelLogin={channelLogin} reloadNonce={reloadNonce} />
    </CompactPreviewFrame>
  );
};

const WorkspaceCardNodeView: React.FC<NodeProps<WorkspaceCardNode>> = ({ id, data, selected }) => {
  const renderContext = useContext(WORKSPACE_RENDER_CONTEXT);
  if (!renderContext) return null;
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const cardAsNode = isCollapsibleCardNodeKind(data.kind);
  const previewHeader = cardAsNode ? null : renderContext.resolvePreviewHeader(data.kind);
  const minSize = resolveWorkspaceCardMinSize(data.kind);
  const showResizeHandles = selected || isHovered || isResizing;
  const nodeInteractionClassName = isResizing ? 'pointer-events-none select-none' : '';
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
          <WorkspaceCardUiContext.Provider value={{ onClose: () => renderContext.removeCard(id), nodeMode: true }}>
            {renderContext.renderCard(data.kind)}
          </WorkspaceCardUiContext.Provider>
        </div>
      ) : (
        <div className={`h-full min-h-0 overflow-hidden rounded-md border border-gray-800/80 bg-gray-950/20 ${nodeInteractionClassName}`}>
          <div className="workspace-node-drag-handle flex h-9 items-center border-b border-gray-800/80 bg-gray-900/85 px-3">
            {previewHeader ? (
              <>
                <span className="truncate font-mono text-xs text-gray-200">channel: {previewHeader.channelLogin || '-'}</span>
                <span className={`ml-2 shrink-0 text-[11px] ${previewHeader.statusClassName}`}>{previewHeader.statusLabel}</span>
                <button
                  type="button"
                  onClick={() => renderContext.refreshPreview(data.kind)}
                  className="nodrag ml-2 inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                  aria-label="プレビューを更新"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                {previewHeader.channelLogin && (
                  <a
                    href={`https://www.twitch.tv/${encodeURIComponent(previewHeader.channelLogin)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="nodrag ml-2 inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
                    aria-label={`${previewHeader.channelLogin} を開く`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            ) : (
              <span className="truncate text-xs font-semibold text-gray-200">{data.title}</span>
            )}
            <button
              type="button"
              className="nodrag ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
              onClick={() => renderContext.removeCard(id)}
              aria-label="カードを削除"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="nodrag h-[calc(100%-2.25rem)] overflow-auto">
            {renderContext.renderCard(data.kind)}
          </div>
        </div>
      )}
    </div>
  );
};

const WORKSPACE_NODE_TYPES: NodeTypes = {
  'workspace-card': WorkspaceCardNodeView,
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
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [raidConfirmChannelId, setRaidConfirmChannelId] = useState<string | null>(null);
  const [raidingChannelId, setRaidingChannelId] = useState<string | null>(null);
  const [shoutoutingChannelId, setShoutoutingChannelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ top: number; left: number } | null>(null);
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(() => readIrcChannels());
  const copiedResetTimerRef = useRef<number | null>(null);

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
              const normalizedChannelLogin = channelLogin.trim().toLowerCase();
              const alreadyConnected = ircConnectedChannels.includes(normalizedChannelLogin);
              const canStartShoutout = canStartRaid && channel.is_live;
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
                      const menuWidth = 192;
                      const menuHeight = 230;
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
                    onMouseEnter={(event) => {
                      const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setHoveredChannelId(channel.broadcaster_id);
                      setHoverAnchor({
                        top: rect.top + (rect.height / 2),
                        left: side === 'left' ? rect.right + 8 : rect.left - 8,
                      });
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
                    <div
                      data-followed-menu="true"
                      className="fixed z-50 w-48 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl"
                      style={{ left: `${menuAnchor.left}px`, top: `${menuAnchor.top}px` }}
                    >
                      <div className="text-xs font-semibold text-gray-100">{channelDisplayName}</div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[11px] text-gray-400">#{channelLogin}</div>
                        <div className="inline-flex items-center gap-1">
                          <a
                            href={`https://www.twitch.tv/${encodeURIComponent(channelLogin)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
                            aria-label={`${channelLogin} のチャンネルを開く`}
                            title="チャンネルを開く"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={async () => {
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
                            }}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
                            aria-label={`${channelLogin} をコピー`}
                            title="チャンネル名をコピー"
                          >
                            {copiedChannelId === channel.broadcaster_id ? (
                              <Check className="h-3 w-3 text-emerald-300" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="mb-2 text-[11px] text-gray-400 truncate">
                        {channel.title || (channel.is_live ? 'LIVE中' : 'オフライン')}
                      </div>
                      <button
                        type="button"
                        disabled={alreadyConnected}
                        onClick={() => {
                          onAddIrcPreview(channel.broadcaster_login);
                          setOpenChannelId(null);
                          setMenuAnchor(null);
                          setRaidConfirmChannelId(null);
                          setShoutoutingChannelId(null);
                        }}
                        className={`mb-1 inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
                          alreadyConnected
                            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                            : 'border-emerald-600/60 text-emerald-300 hover:bg-emerald-700/20'
                        }`}
                      >
                        {alreadyConnected ? '接続済み' : '接続'}
                      </button>
                      <button
                        type="button"
                        disabled={!canStartShoutout || shoutoutingChannelId === channel.broadcaster_id}
                        onClick={async () => {
                          setActionError('');
                          setRaidConfirmChannelId(null);
                          setShoutoutingChannelId(channel.broadcaster_id);
                          try {
                            await onStartShoutout(channel);
                            setOpenChannelId(null);
                            setMenuAnchor(null);
                            setShoutoutingChannelId(null);
                          } catch (error: any) {
                            setActionError(error?.message || '応援に失敗しました');
                          } finally {
                            setShoutoutingChannelId(null);
                          }
                        }}
                        className={`mb-1 inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
                          !canStartShoutout
                            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                            : 'border-fuchsia-600/60 text-fuchsia-200 hover:bg-fuchsia-700/20'
                        } disabled:opacity-60`}
                      >
                        {shoutoutingChannelId === channel.broadcaster_id ? '応援中...' : '応援'}
                      </button>
                      <button
                        type="button"
                        disabled={!canStartRaid || raidingChannelId === channel.broadcaster_id}
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
                          !canStartRaid
                            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                            : raidConfirmChannelId === channel.broadcaster_id
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
                <div className="text-[10px] leading-tight text-gray-300">
                  {hoveredChannel.is_live ? `LIVE ${hoveredChannel.viewer_count}` : 'OFFLINE'}
                </div>
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
      className="fixed left-0 right-0 top-0 z-30 h-12 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm xl:left-[var(--settings-topbar-left)] xl:right-[var(--settings-topbar-right)]"
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
                className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-[34rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl"
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
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkspaceCardNode>(initialWorkspace);
  const [workspaceViewport, setWorkspaceViewport] = useState<Viewport | null>(() => initialWorkspaceFlow?.viewport ?? null);
  const [previewReloadNonceByKind, setPreviewReloadNonceByKind] = useState<Record<string, number>>({});
  const shouldFitWorkspaceOnInitRef = useRef(initialWorkspaceFlow?.viewport == null);
  const workspaceFlowInstanceRef = useRef<ReactFlowInstance<WorkspaceCardNode> | null>(null);
  const lastWorkspaceCardPositionRef =
    useRef<Partial<Record<WorkspaceCardKind, { x: number; y: number }>>>(initialWorkspaceCardLastPositions);

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

  const handleWorkspaceMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setWorkspaceViewport(normalizeWorkspaceViewport(viewport));
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

  const resolveWorkspaceCardSpawnPosition = useCallback((kind: WorkspaceCardKind, existingCount: number) => {
    const remembered = lastWorkspaceCardPositionRef.current[kind];
    if (remembered) {
      return remembered;
    }

    const offset = existingCount * 36;
    const fallback = {
      x: 160 + (offset % 720),
      y: 120 + Math.floor(offset / 6) * 52,
    };

    const instance = workspaceFlowInstanceRef.current;
    if (!instance || typeof window === 'undefined') {
      return fallback;
    }

    try {
      const base = instance.screenToFlowPosition({
        x: Math.max(0, Math.floor(window.innerWidth / 2)),
        y: Math.max(0, Math.floor(window.innerHeight / 2)),
      });
      const size = resolveWorkspaceCardSize(kind);
      const shift = (existingCount % 6) * 24;
      return {
        x: base.x - (size.width / 2) + shift,
        y: base.y - (size.height / 2) + Math.floor(existingCount / 6) * 24,
      };
    } catch {
      return fallback;
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
      const position = resolveWorkspaceCardSpawnPosition(previewKind, existing.length);
      return [...existing, createWorkspaceNode(previewKind, position)];
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
          const startedAt = typeof item.started_at === 'string'
            ? item.started_at
            : typeof item.startedAt === 'string'
              ? item.startedAt
              : undefined;
          const liveFlag = item.is_live ?? item.isLive;
          const isLive = typeof liveFlag === 'boolean'
            ? liveFlag
            : viewerCount > 0 || Boolean(startedAt);
          return {
            broadcaster_id: String(item.broadcaster_id ?? item.id ?? ''),
            broadcaster_login: String(item.broadcaster_login ?? item.login ?? ''),
            broadcaster_name: String(item.broadcaster_name ?? item.display_name ?? item.login ?? ''),
            profile_image_url: String(item.profile_image_url ?? ''),
            followed_at: typeof item.followed_at === 'string' ? item.followed_at : undefined,
            is_live: isLive,
            viewer_count: viewerCount,
            title: typeof item.title === 'string' ? item.title : undefined,
            started_at: startedAt,
          };
        }).filter((item) => item.broadcaster_id && item.broadcaster_login);

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
      const position = resolveWorkspaceCardSpawnPosition(kind, current.length);
      return [...current, createWorkspaceNode(kind, position)];
    });
  }, [resolveWorkspaceCardSpawnPosition, setNodes]);

  const canAddCard = useCallback((kind: WorkspaceCardKind) => {
    return !nodes.some((node) => node.data.kind === kind);
  }, [nodes]);

  const removeWorkspaceCard = useCallback((id: string) => {
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

  const refreshPreview = useCallback((kind: WorkspaceCardKind) => {
    if (!isPreviewCardKind(kind)) return;
    setPreviewReloadNonceByKind((current) => ({
      ...current,
      [kind]: (current[kind] ?? 0) + 1,
    }));
  }, []);

  const renderWorkspaceCard = useCallback((kind: WorkspaceCardKind) => {
    const reloadNonce = previewReloadNonceByKind[kind] ?? 0;
    if (kind === 'preview-main') {
      return (
        <TwitchStreamPreview
          isTwitchConfigured={Boolean(featureStatus?.twitch_configured)}
          isAuthenticated={Boolean(authStatus?.authenticated)}
          channelLogin={twitchUserInfo?.login ?? ''}
          reloadNonce={reloadNonce}
        />
      );
    }
    if (isPreviewIrcKind(kind)) {
      const channelLogin = kind.slice('preview-irc:'.length);
      return <AddedChannelStreamPreview channelLogin={channelLogin} reloadNonce={reloadNonce} />;
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
    previewText,
    setPreviewText,
    streamStatus,
    testingNotification,
    twitchUserInfo?.login,
    uploadingFont,
    previewReloadNonceByKind,
  ]);

  const resolvePreviewHeader = useCallback((kind: WorkspaceCardKind) => {
    if (kind === 'preview-main') {
      const channelLogin = twitchUserInfo?.login ?? '';
      const isLive = Boolean(streamStatus?.is_live);
      return {
        channelLogin,
        statusLabel: isLive ? `LIVE (${streamStatus?.viewer_count ?? 0})` : 'OFFLINE',
        statusClassName: isLive ? 'text-red-400' : 'text-gray-400',
      };
    }
    if (isPreviewIrcKind(kind)) {
      return {
        channelLogin: kind.slice('preview-irc:'.length),
        statusLabel: 'IRC',
        statusClassName: 'text-emerald-400',
      };
    }
    return null;
  }, [streamStatus?.is_live, streamStatus?.viewer_count, twitchUserInfo?.login]);

  const workspaceRenderContext = useMemo<WorkspaceRenderContextValue>(() => ({
    removeCard: removeWorkspaceCard,
    refreshPreview,
    snapCardSize: snapWorkspaceCardSize,
    renderCard: renderWorkspaceCard,
    resolvePreviewHeader,
  }), [removeWorkspaceCard, refreshPreview, snapWorkspaceCardSize, renderWorkspaceCard, resolvePreviewHeader]);

  useEffect(() => {
    writeWorkspaceFlow(nodes, workspaceViewport);
  }, [nodes, workspaceViewport]);

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
          className="fixed inset-0 z-0 top-12 xl:left-[var(--rf-flow-left)] xl:right-[var(--rf-flow-right)]"
          style={{
            '--rf-flow-left': `${topBarOffsets.left}px`,
            '--rf-flow-right': `${topBarOffsets.right}px`,
          } as React.CSSProperties}
        >
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            onMoveEnd={handleWorkspaceMoveEnd}
            onInit={handleWorkspaceFlowInit}
            nodeTypes={WORKSPACE_NODE_TYPES}
            minZoom={WORKSPACE_FLOW_MIN_ZOOM}
            maxZoom={WORKSPACE_FLOW_MAX_ZOOM}
            snapToGrid={workspaceSnapEnabled}
            snapGrid={WORKSPACE_SNAP_GRID}
            defaultViewport={workspaceViewport ?? DEFAULT_WORKSPACE_VIEWPORT}
            className="settings-workspace-flow bg-slate-950"
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#334155" gap={WORKSPACE_SNAP_GRID[0]} size={1} />
            <Controls className="!border !border-gray-700 !bg-gray-900/90 !text-gray-100">
              <ControlButton
                onClick={() => setWorkspaceSnapEnabled((current) => !current)}
                title={workspaceSnapEnabled ? 'スナップ: ON' : 'スナップ: OFF'}
                aria-label={workspaceSnapEnabled ? 'スナップをオフにする' : 'スナップをオンにする'}
                className={`react-flow__controls-snap ${workspaceSnapEnabled ? '!text-emerald-300' : '!text-gray-400'}`}
              >
                <Magnet className="h-4 w-4" />
              </ControlButton>
            </Controls>
          </ReactFlow>
        </div>

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
