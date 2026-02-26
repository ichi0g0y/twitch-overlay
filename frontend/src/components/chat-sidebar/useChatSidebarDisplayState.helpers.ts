import { useEffect, useMemo } from 'react';
import type React from 'react';

export const useEnsureEmbedMinWidth = ({
  activeChatDisplayMode,
  width,
  embedMinWidth,
  onWidthChange,
}: {
  activeChatDisplayMode: 'custom' | 'embed';
  width: number;
  embedMinWidth: number;
  onWidthChange: (width: number) => void;
}) => {
  useEffect(() => {
    if (activeChatDisplayMode !== 'embed') return;
    if (width >= embedMinWidth) return;
    onWidthChange(embedMinWidth);
  }, [activeChatDisplayMode, embedMinWidth, onWidthChange, width]);
};

export const buildLayoutPresentation = ({
  embedded,
  side,
  width,
  avoidEdgeRail,
  isCollapsed,
  collapsedDesktopWidth,
  edgeRailOffsetXlPx,
  fontSize,
}: {
  embedded: boolean;
  side: 'left' | 'right';
  width: number;
  avoidEdgeRail: boolean;
  isCollapsed: boolean;
  collapsedDesktopWidth: number;
  edgeRailOffsetXlPx: number;
  fontSize: number;
}) => {
  const asideWidthClass = 'w-full lg:w-[var(--chat-sidebar-width)] xl:w-[var(--chat-sidebar-reserved-width)]';
  const fixedWidthClass = 'w-full lg:w-[var(--chat-sidebar-width)]';
  const resizeHandleSideClass = side === 'left' ? 'right-0 translate-x-full' : 'left-0 -translate-x-full';
  const fixedSideClass = side === 'left'
    ? (avoidEdgeRail ? 'lg:left-4 xl:left-16' : 'lg:left-4')
    : (avoidEdgeRail ? 'lg:right-4 xl:right-16' : 'lg:right-4');
  const fixedOffsetClass = 'lg:top-6';
  const effectiveSidebarWidth = isCollapsed ? collapsedDesktopWidth : width;
  const reservedSidebarWidth = effectiveSidebarWidth + (avoidEdgeRail ? edgeRailOffsetXlPx : 0);
  const sidebarStyle = {
    '--chat-sidebar-width': `${effectiveSidebarWidth}px`,
    '--chat-sidebar-reserved-width': `${reservedSidebarWidth}px`,
  } as React.CSSProperties;
  const asideClass = embedded ? 'h-full w-full' : `transition-all duration-200 self-start ${asideWidthClass}`;
  const wrapperClass = embedded
    ? 'h-full w-full relative'
    : `${fixedWidthClass} lg:fixed ${fixedOffsetClass} ${fixedSideClass} relative`;
  const panelClass = embedded
    ? `h-full bg-white dark:bg-gray-800 border-gray-700 ${side === 'left' ? 'border-r' : 'border-l'} flex flex-col overflow-hidden relative`
    : 'h-[calc(100vh-48px)] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm flex flex-col overflow-hidden relative';
  const metaFontSize = Math.max(10, fontSize - 2);
  const translationFontSize = Math.max(10, fontSize - 2);

  return {
    asideClass,
    wrapperClass,
    panelClass,
    sidebarStyle,
    resizeHandleSideClass,
    metaFontSize,
    translationFontSize,
  };
};

export const useChatSidebarLayoutPresentation = ({
  activeChatDisplayMode,
  width,
  embedMinWidth,
  onWidthChange,
  embedded,
  side,
  avoidEdgeRail,
  isCollapsed,
  collapsedDesktopWidth,
  edgeRailOffsetXlPx,
  fontSize,
}: {
  activeChatDisplayMode: 'custom' | 'embed';
  width: number;
  embedMinWidth: number;
  onWidthChange: (width: number) => void;
  embedded: boolean;
  side: 'left' | 'right';
  avoidEdgeRail: boolean;
  isCollapsed: boolean;
  collapsedDesktopWidth: number;
  edgeRailOffsetXlPx: number;
  fontSize: number;
}) => {
  useEnsureEmbedMinWidth({
    activeChatDisplayMode,
    width,
    embedMinWidth,
    onWidthChange,
  });

  return useMemo(
    () => buildLayoutPresentation({
      embedded,
      side,
      width,
      avoidEdgeRail,
      isCollapsed,
      collapsedDesktopWidth,
      edgeRailOffsetXlPx,
      fontSize,
    }),
    [avoidEdgeRail, collapsedDesktopWidth, edgeRailOffsetXlPx, embedded, fontSize, isCollapsed, side, width],
  );
};
