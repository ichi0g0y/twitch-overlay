export type WorkspaceMenuCategory =
  | 'preview'
  | 'general'
  | 'mic'
  | 'twitch'
  | 'printer'
  | 'music'
  | 'overlay'
  | 'cache'
  | 'system';

export type TopBarMenuItem = {
  kind: string;
  label: string;
  description: string;
};

export const WORKSPACE_MENU_CATEGORY_ORDER: WorkspaceMenuCategory[] = [
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

export const WORKSPACE_MENU_CATEGORY_LABELS: Record<WorkspaceMenuCategory, string> = {
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

export const resolveWorkspaceMenuCategory = (kind: string): WorkspaceMenuCategory => {
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

export const truncateText = (input: string, max = 80) => {
  const normalized = (input || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
};
