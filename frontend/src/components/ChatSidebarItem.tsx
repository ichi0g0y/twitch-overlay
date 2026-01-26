import React from 'react';
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
  message: string;
  fragments?: ChatFragment[];
  avatarUrl?: string;
  translation?: string;
  translationStatus?: string;
  translationLang?: string;
  timestamp?: string;
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
};

export const ChatSidebarItem: React.FC<ChatSidebarItemProps> = ({
  message,
  index,
  fontSize,
  metaFontSize,
  translationFontSize,
  timestampLabel,
}) => {
  const isEven = index % 2 === 0;
  const hasTranslationLine =
    message.translationStatus === 'pending' || (message.translationStatus !== 'pending' && !!message.translation);
  const showLangInMeta = message.translationLang && !hasTranslationLine;

  const langCode = normalizeLangCode(message.translationLang);
  const langLabel = resolveLangLabel(langCode);
  const shouldShowLang = langCode !== '' && langCode !== 'und' && langCode !== 'jpn' && langLabel !== '';
  const isPendingTranslation = message.translationStatus === 'pending';

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
      className={`py-3 px-4 first:pt-0 last:pb-0 text-sm text-left ${
        isEven
          ? 'bg-gray-50/60 dark:bg-gray-800/40'
          : 'bg-white/60 dark:bg-gray-900/30'
      }`}
      style={{ fontSize }}
    >
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400" style={{ fontSize: metaFontSize }}>
        {message.avatarUrl ? (
          <img
            src={message.avatarUrl}
            alt={`${message.username} avatar`}
            className="rounded-full object-cover"
            style={{ width: `${fontSize}px`, height: `${fontSize}px` }}
            loading="lazy"
          />
        ) : (
          <div
            className="rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center"
            style={{ width: `${fontSize}px`, height: `${fontSize}px`, fontSize: `${Math.max(10, fontSize * 0.6)}px` }}
          >
            {message.username?.slice(0, 1)}
          </div>
        )}
        <span className="font-semibold text-gray-700 dark:text-gray-200">{message.username}</span>
        <span>{timestampLabel}</span>
      </div>
      <div
        className="mt-1 text-gray-800 dark:text-gray-100 break-words"
        style={{ lineHeight: `${Math.round(fontSize * 1.1)}px` }}
      >
        <MessageContent message={message.message} fragments={message.fragments} fontSize={fontSize} />
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
