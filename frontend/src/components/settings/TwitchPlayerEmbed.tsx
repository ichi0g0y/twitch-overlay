import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadTwitchEmbedScript } from '../../utils/twitchEmbed';
import { getTwitchParentDomain } from '../../utils/twitchParentDomain';

type TwitchPlayerEmbedProps = {
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled?: boolean;
  interactionDisabled?: boolean;
  onWarningChange: (warningMessage: string | null) => void;
};

const TWITCH_IFRAME_PATCH_TIMEOUT_MS = 5000;

const patchIframeAllow = (container: HTMLElement): boolean => {
  const iframe = container.querySelector('iframe');
  if (!(iframe instanceof HTMLIFrameElement)) return false;
  const allow = iframe.getAttribute('allow') ?? '';
  if (!allow.includes('autoplay')) {
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
  }
  iframe.style.overscrollBehavior = 'none';
  iframe.style.overscrollBehaviorX = 'none';
  iframe.style.overscrollBehaviorY = 'none';
  return true;
};

export const TwitchPlayerEmbed: React.FC<TwitchPlayerEmbedProps> = ({
  channelLogin,
  reloadNonce,
  autoplayEnabled = false,
  interactionDisabled = false,
  onWarningChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedChannel = channelLogin.trim();
  const parentDomain = useMemo(() => getTwitchParentDomain(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    if (!normalizedChannel) {
      container.replaceChildren();
      setErrorMessage(null);
      return undefined;
    }

    let cancelled = false;
    let patchObserver: MutationObserver | null = null;
    let patchTimeout: number | null = null;

    const clearPatch = () => {
      patchObserver?.disconnect(); patchObserver = null;
      if (patchTimeout !== null) { window.clearTimeout(patchTimeout); patchTimeout = null; }
    };

    const setup = async () => {
      try {
        container.replaceChildren();
        setErrorMessage(null);
        await loadTwitchEmbedScript();
        if (cancelled) return;
        if (!window.Twitch?.Player) throw new Error('Twitch Embed SDK is not available');

        new window.Twitch.Player(container, {
          channel: normalizedChannel, parent: [parentDomain],
          width: '100%', height: '100%', autoplay: autoplayEnabled, muted: true, controls: true,
        });

        if (!patchIframeAllow(container)) {
          patchObserver = new MutationObserver(() => { if (patchIframeAllow(container)) clearPatch(); });
          patchObserver.observe(container, { childList: true, subtree: true });
          patchTimeout = window.setTimeout(clearPatch, TWITCH_IFRAME_PATCH_TIMEOUT_MS);
        }
      } catch {
        if (!cancelled) setErrorMessage('Twitchプレビューの読み込みに失敗しました。');
      }
    };

    void setup();
    return () => { cancelled = true; clearPatch(); container.replaceChildren(); };
  }, [autoplayEnabled, normalizedChannel, parentDomain, reloadNonce]);

  useEffect(() => {
    onWarningChange(errorMessage);
  }, [errorMessage, onWarningChange]);

  const handleInteractionStart = () => {
    if (interactionDisabled) return;
    const nodeEl = containerRef.current?.closest('.react-flow__node');
    const nodeId = nodeEl?.getAttribute('data-id');
    if (!nodeId) return;
    window.dispatchEvent(new CustomEvent('workspace-preview-bring-to-front', { detail: { nodeId } }));
  };

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={handleInteractionStart}
      onTouchStartCapture={handleInteractionStart}
      className={`nodrag nopan h-full w-full overflow-hidden ${interactionDisabled ? 'pointer-events-none' : 'pointer-events-auto'}`}
    />
  );
};
