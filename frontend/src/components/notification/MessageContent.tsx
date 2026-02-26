import { Fragment as ReactFragment, type ReactNode } from 'react';
import { Fragment } from '../../types/notification';

interface MessageContentProps {
  message: string;
  fragments?: Fragment[];
  fontSize?: number;
  linkifyUrls?: boolean;
}

const URL_PATTERN = /https?:\/\/[^\s]+/gi;

const isBlankTextFragment = (fragment: Fragment): boolean => {
  return fragment.type === 'text' && fragment.text.trim() === '';
};

const getAdjacentNonBlankFragment = (fragments: Fragment[], startIndex: number, step: -1 | 1): Fragment | undefined => {
  let index = startIndex + step;
  while (index >= 0 && index < fragments.length) {
    const fragment = fragments[index];
    if (!isBlankTextFragment(fragment)) {
      return fragment;
    }
    index += step;
  }
  return undefined;
};

const splitTrailingPunctuation = (url: string): { cleanUrl: string; trailing: string } => {
  let splitIndex = url.length;
  let trailing = '';

  while (splitIndex > 0) {
    const ch = url[splitIndex - 1];
    if (!'),.;!?'.includes(ch)) {
      break;
    }

    if (ch === ')') {
      const prefix = url.slice(0, splitIndex);
      const openCount = (prefix.match(/\(/g) || []).length;
      const closeCount = (prefix.match(/\)/g) || []).length;
      // URL内部の対応する括弧は残す。余分な閉じ括弧だけを末尾記号として分離する。
      if (closeCount <= openCount) {
        break;
      }
    }

    trailing = ch + trailing;
    splitIndex -= 1;
  }

  if (trailing === '') {
    return { cleanUrl: url, trailing: '' };
  }

  const cleanUrl = url.slice(0, splitIndex);
  return cleanUrl ? { cleanUrl, trailing } : { cleanUrl: url, trailing: '' };
};

/**
 * MessageContent component
 * Renders message fragments with text and emotes
 */
export function MessageContent({ message, fragments, fontSize = 14, linkifyUrls = false }: MessageContentProps) {
  const renderText = (text: string, keyPrefix: string) => {
    if (!linkifyUrls) {
      return <span key={`${keyPrefix}-text`}>{text}</span>;
    }

    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let tokenIndex = 0;

    for (const match of text.matchAll(URL_PATTERN)) {
      const matchedText = match[0];
      const start = match.index ?? 0;
      const end = start + matchedText.length;

      if (start > lastIndex) {
        nodes.push(
          <span key={`${keyPrefix}-text-${tokenIndex}`}>
            {text.slice(lastIndex, start)}
          </span>,
        );
        tokenIndex += 1;
      }

      const { cleanUrl, trailing } = splitTrailingPunctuation(matchedText);
      nodes.push(
        <a
          key={`${keyPrefix}-url-${tokenIndex}`}
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted break-all"
        >
          {cleanUrl}
        </a>,
      );
      tokenIndex += 1;

      if (trailing) {
        nodes.push(<span key={`${keyPrefix}-trail-${tokenIndex}`}>{trailing}</span>);
        tokenIndex += 1;
      }

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      nodes.push(<span key={`${keyPrefix}-tail-${tokenIndex}`}>{text.slice(lastIndex)}</span>);
    }

    if (nodes.length === 0) {
      return <span key={`${keyPrefix}-plain`}>{text}</span>;
    }

    return nodes;
  };

  // If no fragments provided, display plain text
  if (!fragments || fragments.length === 0) {
    return <>{renderText(message, 'plain')}</>;
  }

  // 旧データ互換: Emoteに挟まれた空白text fragmentは描画から除外する
  const displayFragments = fragments.filter((fragment, index, source) => {
    if (!isBlankTextFragment(fragment)) {
      return true;
    }
    const prev = getAdjacentNonBlankFragment(source, index, -1);
    const next = getAdjacentNonBlankFragment(source, index, 1);
    return !(prev?.type === 'emote' && next?.type === 'emote');
  });

  // Calculate emote height based on font size (1.2x ratio)
  const emoteHeight = `${fontSize * 1.2}px`;

  // Render fragments (text + emotes)
  return (
    <>
      {displayFragments.map((fragment, index) => {
        if (fragment.type === 'emote' && fragment.emoteUrl) {
          const prevIsEmote = index > 0 && displayFragments[index - 1].type === 'emote';
          const nextIsEmote = index < displayFragments.length - 1 && displayFragments[index + 1].type === 'emote';
          const marginClass = `${prevIsEmote ? '' : 'ml-[0.1em]'} ${nextIsEmote ? 'mr-[2px]' : 'mr-[0.1em]'}`.trim();

          return (
            <img
              key={index}
              src={fragment.emoteUrl}
              alt={fragment.text}
              className={`inline align-middle ${marginClass}`}
              style={{ height: emoteHeight }}
              title={fragment.text}
              loading="lazy"
            />
          );
        } else {
          return <ReactFragment key={index}>{renderText(fragment.text, `fragment-${index}`)}</ReactFragment>;
        }
      })}
    </>
  );
}
