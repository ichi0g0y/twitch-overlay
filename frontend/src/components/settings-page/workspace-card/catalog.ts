import type {
  BaseWorkspaceCardKind,
  LegacyWorkspaceCardKind,
  WorkspaceCardKind,
  WorkspaceCardMenuItem,
} from "./types";

export const BASE_CARD_KIND_SET = new Set<BaseWorkspaceCardKind>([
  "preview-main",
  "general-basic",
  "general-notification",
  "general-font",
  "mic-speech",
  "mic-overlay-display",
  "twitch-api",
  "twitch-reward-groups",
  "twitch-custom-rewards",
  "printer-type",
  "printer-bluetooth",
  "printer-usb",
  "printer-print",
  "printer-clock",
  "music-manager",
  "overlay-music-player",
  "overlay-fax",
  "overlay-clock",
  "overlay-mic-transcript",
  "overlay-reward-count",
  "overlay-lottery",
  "logs",
  "cache-stats",
  "cache-config",
  "cache-actions",
  "api",
]);

export const BASE_WORKSPACE_MENU: WorkspaceCardMenuItem[] = [
  {
    kind: "preview-main",
    label: "配信プレビュー",
    description: "現在の配信状態と埋め込みプレビュー",
  },
  {
    kind: "general-basic",
    label: "一般: 基本設定",
    description: "タイムゾーンと基本動作",
  },
  {
    kind: "general-notification",
    label: "一般: 通知設定",
    description: "通知ウィンドウ表示設定",
  },
  {
    kind: "general-font",
    label: "一般: フォント設定",
    description: "フォントアップロードとプレビュー",
  },
  {
    kind: "mic-speech",
    label: "マイク: 音声認識",
    description: "Web Speech認識設定",
  },
  {
    kind: "mic-overlay-display",
    label: "マイク: 表示設定",
    description: "文字起こしオーバーレイ表示設定",
  },
  {
    kind: "twitch-api",
    label: "Twitch: API設定",
    description: "認証とAPIキー設定",
  },
  {
    kind: "twitch-reward-groups",
    label: "Twitch: リワードグループ",
    description: "リワードグループ管理",
  },
  {
    kind: "twitch-custom-rewards",
    label: "Twitch: カスタムリワード",
    description: "カスタムリワード一覧",
  },
  {
    kind: "printer-type",
    label: "プリンター: 種類",
    description: "プリンター種別選択",
  },
  {
    kind: "printer-bluetooth",
    label: "プリンター: Bluetooth",
    description: "Bluetooth接続設定",
  },
  {
    kind: "printer-usb",
    label: "プリンター: USB",
    description: "USBプリンター設定",
  },
  {
    kind: "printer-print",
    label: "プリンター: 印刷設定",
    description: "品質と印刷動作設定",
  },
  {
    kind: "printer-clock",
    label: "プリンター: 時計印刷",
    description: "毎時印刷設定",
  },
  {
    kind: "music-manager",
    label: "音楽: 管理",
    description: "プレイリストと再生制御",
  },
  {
    kind: "overlay-music-player",
    label: "Overlay: 音楽プレイヤー",
    description: "音楽表示カード設定",
  },
  {
    kind: "overlay-fax",
    label: "Overlay: FAX",
    description: "FAX表示カード設定",
  },
  {
    kind: "overlay-clock",
    label: "Overlay: 時計",
    description: "時計表示カード設定",
  },
  {
    kind: "overlay-mic-transcript",
    label: "Overlay: 文字起こし",
    description: "字幕表示カード設定",
  },
  {
    kind: "overlay-reward-count",
    label: "Overlay: リワード集計",
    description: "リワード表示カード設定",
  },
  {
    kind: "overlay-lottery",
    label: "Overlay: 抽選",
    description: "抽選表示カード設定",
  },
  { kind: "logs", label: "ログ", description: "各種ログの確認" },
  {
    kind: "cache-stats",
    label: "キャッシュ: 統計",
    description: "キャッシュ使用状況",
  },
  {
    kind: "cache-config",
    label: "キャッシュ: 設定",
    description: "保存上限と期限設定",
  },
  {
    kind: "cache-actions",
    label: "キャッシュ: 管理操作",
    description: "手動削除とクリーンアップ",
  },
  { kind: "api", label: "API", description: "API関連の状態確認" },
];

export const LEGACY_WORKSPACE_CARD_KIND_MAP: Record<
  LegacyWorkspaceCardKind,
  WorkspaceCardKind
> = {
  general: "general-basic",
  mic: "mic-speech",
  twitch: "twitch-api",
  printer: "printer-type",
  music: "music-manager",
  overlay: "overlay-music-player",
  cache: "cache-stats",
};
