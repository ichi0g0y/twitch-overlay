import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadTwitchEmbedScript } from '../../utils/twitchEmbed';

type TwitchPlayerEmbedProps = {
  channelLogin: string;
  reloadNonce: number;
  onWarningChange: (warningMessage: string | null) => void;
};

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
};

const TWITCH_AUTOPLAY_MIN_WIDTH = 400;
const TWITCH_AUTOPLAY_MIN_HEIGHT = 300;

export const TwitchPlayerEmbed: React.FC<TwitchPlayerEmbedProps> = ({ channelLogin, reloadNonce, onWarningChange }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const parentDomain = useMemo(
    () => (typeof window !== 'undefined'
      ? (window.location.hostname?.replace(/^tauri\./, '') || 'localhost')
      : 'localhost'),
    [],
  );
  const canMountPlayer = Boolean(
    overlayRect
      && overlayRect.visible
      && channelLogin.trim().length > 0,
  );

  const updateOverlayRect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const anchor = anchorRef.current;
    if (!anchor) {
      setOverlayRect(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const style = window.getComputedStyle(anchor);
    const nodeElement = anchor.closest('.react-flow__node') as HTMLElement | null;
    const nodeStyle = nodeElement ? window.getComputedStyle(nodeElement) : null;
    const parsedNodeZIndex = Number.parseInt(nodeStyle?.zIndex ?? '', 10);
    const zIndex = Number.isFinite(parsedNodeZIndex) ? parsedNodeZIndex + 1 : 30;
    const visible = rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity || '1') > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;

    const next: OverlayRect = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      zIndex,
      visible,
    };

    setOverlayRect((prev) => {
      if (
        prev
        && prev.left === next.left
        && prev.top === next.top
        && prev.width === next.width
        && prev.height === next.height
        && prev.zIndex === next.zIndex
        && prev.visible === next.visible
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const anchor = anchorRef.current;
    if (!anchor) return undefined;

    let rafId: number | null = null;
    const requestUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateOverlayRect();
      });
    };

    requestUpdate();

    const resizeObserver = new ResizeObserver(() => requestUpdate());
    resizeObserver.observe(anchor);

    const viewportElement = anchor.closest('.react-flow__viewport');
    const mutationObserver = new MutationObserver(() => requestUpdate());
    if (viewportElement) {
      mutationObserver.observe(viewportElement, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    window.addEventListener('resize', requestUpdate);
    window.addEventListener('scroll', requestUpdate, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', requestUpdate);
      window.removeEventListener('scroll', requestUpdate, true);
    };
  }, [updateOverlayRect]);

  useEffect(() => {
    if (!canMountPlayer) {
      setErrorMessage(null);
      return undefined;
    }

    const container = containerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let cleanup = () => {};
    let retryTimer: number | null = null;

    container.replaceChildren();
    setErrorMessage(null);

    const setupPlayer = async (): Promise<void> => {
      try {
        await loadTwitchEmbedScript();
        if (cancelled) return;
        if (!window.Twitch?.Player) throw new Error('Twitch Embed SDK is not available');

        const player = new window.Twitch.Player(container, {
          channel: channelLogin,
          parent: [parentDomain],
          width: '100%',
          height: '100%',
          autoplay: true,
          muted: true,
          controls: true,
        });

        const playWithRetry = (remaining: number) => {
          if (cancelled) return;
          try {
            player.setMuted(true);
          } catch {
            // no-op
          }
          try {
            const playPromise = player.play();
            if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
              void (playPromise as Promise<void>).catch(() => {
                if (remaining <= 0 || cancelled) return;
                retryTimer = window.setTimeout(() => {
                  playWithRetry(remaining - 1);
                }, 350);
              });
            }
          } catch {
            if (remaining <= 0 || cancelled) return;
            retryTimer = window.setTimeout(() => {
              playWithRetry(remaining - 1);
            }, 350);
          }
        };

        const readyEvent = window.Twitch.Player.READY ?? 'ready';
        const handleReady = () => {
          playWithRetry(8);
        };

        player.addEventListener(readyEvent, handleReady);
        cleanup = () => {
          if (retryTimer !== null) {
            window.clearTimeout(retryTimer);
          }
          player.removeEventListener(readyEvent, handleReady);
          container.replaceChildren();
        };
      } catch {
        if (!cancelled) {
          setErrorMessage('Twitchプレビューの読み込みに失敗しました。');
        }
      }
    };

    void setupPlayer();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      cleanup();
      container.replaceChildren();
    };
  }, [canMountPlayer, channelLogin, parentDomain, reloadNonce]);

  useEffect(() => {
    if (errorMessage) {
      onWarningChange(errorMessage);
      return;
    }
    onWarningChange(null);
  }, [errorMessage, onWarningChange]);

  const renderOverlayContent = () => {
    if (typeof document === 'undefined') return null;
    if (!overlayRect || !overlayRect.visible) return null;

    return createPortal(
      <div
        style={{
          position: 'fixed',
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
          height: overlayRect.height,
          zIndex: overlayRect.zIndex,
        }}
        className="nodrag nopan overflow-hidden bg-black"
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>,
      document.body,
    );
  };

  return (
    <>
      <div ref={anchorRef} className="h-full w-full" />
      {renderOverlayContent()}
    </>
  );
};
