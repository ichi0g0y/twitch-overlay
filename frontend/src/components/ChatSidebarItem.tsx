import React from 'react';
import { Code } from 'lucide-react';
import { MessageContent } from './notification/MessageContent';
import languageNames from '../data/iso6393-names.json';

export type ChatFragment = {
  type: 'text' | 'emote';
  text: string;
  emoteId?: string;
  emoteUrl?: string;
};

export type ChatMessage = {
  id: string;
  messageId?: string;
  userId?: string;
  username: string;
  displayName?: string;
  message: string;
  color?: string;
  chatSource?: 'eventsub' | 'irc';
  badgeKeys?: string[];
  fragments?: ChatFragment[];
  avatarUrl?: string;
  translation?: string;
  translationStatus?: string;
  translationLang?: string;
  timestamp?: string;
};

const TWITCH_CHAT_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const hexToRgb = (hex: string): [number, number, number] | null => {
  if (!TWITCH_CHAT_COLOR_RE.test(hex)) return null;
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - (l * s);
  const p = (2 * l) - q;
  const r = hue2rgb(p, q, h + (1 / 3));
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - (1 / 3));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const normalizeReadableChatColor = (hex?: string): string | undefined => {
  if (!hex || !TWITCH_CHAT_COLOR_RE.test(hex)) return undefined;
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;

  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  let nextL = l;

  // Avoid very dark / very bright colors against alternating light/dark row backgrounds.
  if (nextL < 0.32) nextL = 0.45;
  else if (nextL > 0.78) nextL = 0.62;

  const [r, g, b] = hslToRgb(h, s, nextL);
  return rgbToHex(r, g, b);
};

const ISO6391_TO_3: Record<string, string> = {
  ja: 'jpn',
  en: 'eng',
  zh: 'cmn',
  ko: 'kor',
  fr: 'fra',
  de: 'deu',
  es: 'spa',
  pt: 'por',
  ru: 'rus',
  it: 'ita',
  id: 'ind',
  th: 'tha',
  vi: 'vie',
  tl: 'fil',
  ar: 'ara',
  hi: 'hin',
  bn: 'ben',
  nl: 'nld',
  sv: 'swe',
  no: 'nor',
  da: 'dan',
  fi: 'fin',
  pl: 'pol',
  tr: 'tur',
  uk: 'ukr',
  el: 'ell',
  he: 'heb',
  hu: 'hun',
  cs: 'ces',
  sk: 'slk',
  ro: 'ron',
  so: 'som',
  bg: 'bul',
  sr: 'srp',
  hr: 'hrv',
  sl: 'slv',
  et: 'est',
  lv: 'lav',
  lt: 'lit',
  fa: 'fas',
  ur: 'urd',
  ta: 'tam',
};

const normalizeLangCode = (lang?: string) => {
  if (!lang) return '';
  const normalized = lang.toLowerCase().split(/[-_]/)[0];
  if (normalized.length === 2) {
    return ISO6391_TO_3[normalized] ?? normalized;
  }
  return normalized;
};

const resolveLangLabel = (langCode: string) => {
  if (!langCode || langCode === 'und') return '';
  const entry = (languageNames as Record<string, { ja?: string; en?: string }>)[langCode];
  if (!entry) return '';
  return entry.ja ?? entry.en ?? '';
};

type ChatSidebarItemProps = {
  message: ChatMessage;
  index: number;
  fontSize: number;
  metaFontSize: number;
  translationFontSize: number;
  timestampLabel: string;
  onUsernameClick?: (message: ChatMessage) => void;
  onRawDataClick?: (message: ChatMessage) => void;
  resolveBadgeVisual?: (badgeKey: string) => { imageUrl: string; label: string } | null;
};

const BOT_USER_ID = '774281749';

export const ChatSidebarItem: React.FC<ChatSidebarItemProps> = ({
  message,
  index,
  fontSize,
  metaFontSize,
  translationFontSize,
  timestampLabel,
  onUsernameClick,
  onRawDataClick,
  resolveBadgeVisual,
}) => {
  const isEven = index % 2 === 0;
  const isBotMessage = message.userId === BOT_USER_ID;
  const hasTranslationLine =
    message.translationStatus === 'pending' || (message.translationStatus !== 'pending' && !!message.translation);
  const showLangInMeta = message.translationLang && !hasTranslationLine;

  const langCode = normalizeLangCode(message.translationLang);
  const langLabel = resolveLangLabel(langCode);
  const shouldShowLang = !isBotMessage && langCode !== '' && langCode !== 'und' && langCode !== 'jpn' && langLabel !== '';
  const isPendingTranslation = message.translationStatus === 'pending';
  const badgeVisuals = (message.badgeKeys || [])
    .map((badgeKey) => badgeKey.trim())
    .filter((badgeKey) => badgeKey !== '')
    .map((badgeKey) => resolveBadgeVisual?.(badgeKey))
    .filter((badge): badge is { imageUrl: string; label: string } => !!badge);
  const displayName = message.displayName || message.username || message.userId || '不明';
  const rawName = (message.username || '').trim();
  const shouldAppendName =
    rawName !== ''
    && displayName.trim() !== ''
    && displayName.toLowerCase() !== rawName.toLowerCase();
  const renderedDisplayName = shouldAppendName ? `${displayName} (${rawName})` : displayName;
  const displayNameNode = (
    <span className="inline-flex min-w-0 max-w-full items-baseline">
      <span className="shrink-0 font-semibold">{displayName}</span>
      {shouldAppendName && <span className="min-w-0 truncate font-normal">{` (${rawName})`}</span>}
    </span>
  );
  const usernameColor = message.chatSource === 'irc'
    ? normalizeReadableChatColor(message.color)
    : undefined;
  const avatarSizeStyle = { width: `${fontSize}px`, height: `${fontSize}px` };
  const avatarFallbackStyle = {
    ...avatarSizeStyle,
    fontSize: `${Math.max(10, fontSize * 0.6)}px`,
  };
  const avatarNode = message.avatarUrl ? (
    <img
      src={message.avatarUrl}
      alt={`${displayName} avatar`}
      className="rounded-full object-cover"
      style={avatarSizeStyle}
      loading="lazy"
    />
  ) : (
    <div
      className="rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center"
      style={avatarFallbackStyle}
    >
      {(displayName || '?')?.slice(0, 1)}
    </div>
  );

  const renderLangLabel = (className: string, spacingClass?: string, uncertain?: boolean) => {
    if (!shouldShowLang) return null;
    const suffix = uncertain ? '?' : '';
    return (
      <span className={`inline-flex items-center gap-1 ${spacingClass ?? ''} ${className}`}>
        <span>
          ({langLabel} {langCode}
          {suffix})
        </span>
      </span>
    );
  };

  return (
    <div
      className={`group py-3 px-4 last:pb-2 text-sm text-left ${
        isBotMessage
          ? 'bg-amber-50/70 dark:bg-amber-900/20 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.5)]'
          : isEven
            ? 'bg-gray-50/60 dark:bg-gray-800/40'
            : 'bg-white/60 dark:bg-gray-900/30'
      }`}
      style={{ fontSize }}
    >
      <div className="flex items-start justify-between text-gray-500 dark:text-gray-400" style={{ fontSize: metaFontSize }}>
        <div className="min-w-0 flex flex-1 items-center gap-[5px]">
          {avatarNode}
          {badgeVisuals.length > 0 && (
            <span className="inline-flex items-center gap-[5px]">
              {badgeVisuals.map((badge, badgeIndex) => (
                <span key={`${badge.label}-${badgeIndex}`} className="inline-flex" title={badge.label}>
                  {badge.imageUrl ? (
                    <img
                      src={badge.imageUrl}
                      alt={badge.label}
                      className="h-4 w-4 rounded-sm object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-gray-200 text-[9px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                      {(badge.label || '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
              ))}
            </span>
          )}
          {onUsernameClick ? (
            <button
              type="button"
              onClick={() => onUsernameClick(message)}
              className="inline-flex min-w-0 max-w-full text-gray-700 dark:text-gray-200 hover:underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:focus-visible:ring-blue-500 rounded-sm"
              aria-label={`${renderedDisplayName} の情報を表示`}
              title={`${renderedDisplayName} の情報を表示`}
              style={usernameColor ? { color: usernameColor } : undefined}
            >
              {displayNameNode}
            </button>
          ) : (
            <span
              className="inline-flex min-w-0 max-w-full text-gray-700 dark:text-gray-200"
              style={usernameColor ? { color: usernameColor } : undefined}
            >
              {displayNameNode}
            </span>
          )}
          {isBotMessage && (
            <span className="rounded bg-amber-200/70 dark:bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              BOT
            </span>
          )}
        </div>
        <div className="ml-2 inline-flex flex-shrink-0 items-center gap-1">
          {onRawDataClick && (
            <button
              type="button"
              onClick={() => onRawDataClick(message)}
              className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-gray-400 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-gray-500 dark:hover:text-gray-200 dark:focus-visible:ring-blue-500"
              aria-label="コメント生データを表示"
              title="コメント生データを表示"
            >
              <Code className="h-3 w-3" />
            </button>
          )}
          <span className="text-gray-300 dark:text-gray-600 tabular-nums">{timestampLabel}</span>
        </div>
      </div>
      <div
        className="mt-1 text-gray-800 dark:text-gray-100 break-words"
        style={{ lineHeight: `${Math.round(fontSize * 1.1)}px` }}
      >
        <MessageContent message={message.message} fragments={message.fragments} fontSize={fontSize} linkifyUrls />
        {showLangInMeta && renderLangLabel('text-amber-500/80 dark:text-amber-200/80', 'ml-2')}
      </div>
      {message.translationStatus === 'pending' && (
        <div
          className="mt-2 flex items-center text-amber-600 dark:text-amber-300"
          style={{
            fontSize: `${translationFontSize}px`,
            lineHeight: `${Math.round(translationFontSize * 1.1)}px`,
          }}
        >
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" aria-label="翻訳中">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v2.2a5.8 5.8 0 00-5.8 5.8H4z" />
          </svg>
          <span className="ml-2">翻訳中</span>
          {renderLangLabel('text-amber-500/80 dark:text-amber-200/80', 'ml-2', isPendingTranslation)}
        </div>
      )}
      {message.translationStatus !== 'pending' && message.translation && (
        <div
          className="mt-2 text-amber-700 dark:text-amber-200"
          style={{
            fontSize: `${translationFontSize}px`,
            lineHeight: `${Math.round(translationFontSize * 1.1)}px`,
          }}
        >
          <span>{message.translation}</span>
          {renderLangLabel('text-amber-500/80 dark:text-amber-200/80', 'ml-2')}
        </div>
      )}
    </div>
  );
};
