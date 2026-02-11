import React from 'react';
import { buildApiUrl } from '../utils/api';
import { ensureGoogleFontsLoaded } from '../utils/googleFonts';
import { getWebSocketClient } from '../utils/websocket';

type FontInfoResponse = {
  font?: {
    hasCustomFont?: boolean;
    filename?: string;
  };
};

type OverlaySettingsResponse = {
  mic_transcript_font_family?: string;
  mic_transcript_translation_font_family?: string;
  mic_transcript_translation2_font_family?: string;
  mic_transcript_translation3_font_family?: string;
};

function filenameBase(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function loadCustomFont(cancelled: () => boolean) {
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
    document.getElementById(styleId)?.remove();
  };

  return async () => {
    try {
      const resp = await fetch(buildApiUrl('/api/settings'));
      if (!resp.ok) { removeStyleTag(); return; }
      const json = (await resp.json()) as FontInfoResponse;
      const hasCustomFont = Boolean(json?.font?.hasCustomFont);
      const filename = String(json?.font?.filename || '').trim();
      if (!hasCustomFont || !filename) { removeStyleTag(); return; }

      const base = filenameBase(filename);
      const srcUrl = buildApiUrl('/api/settings/font/file');
      const families = [base, filename, 'CustomFont'].filter(Boolean);
      const css = families
        .map((f) => `@font-face { font-family: ${JSON.stringify(f)}; src: url(${JSON.stringify(srcUrl)}); font-display: swap; }`)
        .join('\n');

      if (cancelled()) return;
      const style = ensureStyleTag();
      if (style.textContent !== css) style.textContent = css;
    } catch {
      removeStyleTag();
    }
  };
}

async function loadGoogleFontsFromSettings(): Promise<void> {
  try {
    const resp = await fetch(buildApiUrl('/api/settings/overlay'));
    if (!resp.ok) return;
    const json = (await resp.json()) as OverlaySettingsResponse;
    const families = [
      json.mic_transcript_font_family,
      json.mic_transcript_translation_font_family,
      json.mic_transcript_translation2_font_family,
      json.mic_transcript_translation3_font_family,
    ].filter((f): f is string => Boolean(f?.trim()));
    if (families.length > 0) ensureGoogleFontsLoaded(families);
  } catch {
    // ignore
  }
}

export const CustomFontLoader: React.FC = () => {
  React.useEffect(() => {
    let cancelled = false;
    const wsClient = getWebSocketClient();
    wsClient.connect();

    const runCustomFont = loadCustomFont(() => cancelled);
    const runAll = async () => {
      await runCustomFont();
      await loadGoogleFontsFromSettings();
    };

    runAll();
    const unsubFont = wsClient.on('font_updated', () => runCustomFont());
    const unsubSettings = wsClient.on('overlay_settings_changed', () => loadGoogleFontsFromSettings());

    return () => {
      cancelled = true;
      unsubFont();
      unsubSettings();
    };
  }, []);

  return null;
};
