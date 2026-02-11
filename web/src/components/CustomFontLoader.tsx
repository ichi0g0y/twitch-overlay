import React from 'react';
import { buildApiUrl } from '../utils/api';
import { getWebSocketClient } from '../utils/websocket';

type FontInfoResponse = {
  font?: {
    hasCustomFont?: boolean;
    filename?: string;
  };
};

function filenameBase(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export const CustomFontLoader: React.FC = () => {
  React.useEffect(() => {
    let cancelled = false;
    const wsClient = getWebSocketClient();
    wsClient.connect();

    const styleId = 'overlay-custom-font-face';
    const ensureStyleTag = (): HTMLStyleElement => {
      const existing = document.getElementById(styleId);
      if (existing && existing instanceof HTMLStyleElement) return existing;
      const style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
      return style;
    };

    const removeStyleTag = () => {
      const existing = document.getElementById(styleId);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    };

    const run = async () => {
      try {
        const resp = await fetch(buildApiUrl('/api/settings'));
        if (!resp.ok) {
          removeStyleTag();
          return;
        }
        const json = (await resp.json()) as FontInfoResponse;
        const hasCustomFont = Boolean(json?.font?.hasCustomFont);
        const filename = String(json?.font?.filename || '').trim();
        if (!hasCustomFont || !filename) {
          removeStyleTag();
          return;
        }

        const base = filenameBase(filename);
        const srcUrl = buildApiUrl('/api/settings/font/file');
        const families = [base, filename, 'CustomFont'].filter(Boolean);
        const css = `
@font-face {
  font-family: ${JSON.stringify(families[0])};
  src: url(${JSON.stringify(srcUrl)});
  font-display: swap;
}
@font-face {
  font-family: ${JSON.stringify(families[1])};
  src: url(${JSON.stringify(srcUrl)});
  font-display: swap;
}
@font-face {
  font-family: ${JSON.stringify(families[2])};
  src: url(${JSON.stringify(srcUrl)});
  font-display: swap;
}
`.trim();

        if (cancelled) return;
        const style = ensureStyleTag();
        if (style.textContent !== css) {
          style.textContent = css;
        }
      } catch {
        removeStyleTag();
      }
    };

    run();
    const unsubFontUpdated = wsClient.on('font_updated', () => run());

    return () => {
      cancelled = true;
      unsubFontUpdated();
    };
  }, []);

  return null;
};
