import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ChromeTranslationDownloadStatus } from '../utils/chromeTranslator';
import { getWebSocketClient } from '../utils/websocket';

export type MicCaptionRecState = 'stopped' | 'starting' | 'running';

export type MicCaptionStatus = {
  wsConnected: boolean;
  capturing: boolean;
  speechSupported: boolean;
  recState: MicCaptionRecState;
  speechLang: string;
  lastInterimText: string;
  lastFinalText: string;
  lastTranslationText: string;
  lastUpdatedAtMs: number | null;
  dualInstanceEnabled: boolean;
  translationEnabled: boolean;
  translationTargets: string[];
  translatorSupported: boolean;
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  downloadStatus: ChromeTranslationDownloadStatus | null;
  error: string | null;
};

const DEFAULT_STATUS: MicCaptionStatus = {
  wsConnected: false,
  capturing: false,
  speechSupported: false,
  recState: 'stopped',
  speechLang: 'ja',
  lastInterimText: '',
  lastFinalText: '',
  lastTranslationText: '',
  lastUpdatedAtMs: null,
  dualInstanceEnabled: true,
  translationEnabled: false,
  translationTargets: [],
  translatorSupported: false,
  antiSexualEnabled: false,
  bouyomiEnabled: false,
  downloadStatus: null,
  error: null,
};

type MicCaptionStatusContextValue = {
  status: MicCaptionStatus;
  updateStatus: (updates: Partial<MicCaptionStatus>) => void;
  resetStatus: () => void;
};

const MicCaptionStatusContext = createContext<MicCaptionStatusContextValue | undefined>(undefined);

export const useMicCaptionStatus = (): MicCaptionStatusContextValue => {
  const ctx = useContext(MicCaptionStatusContext);
  if (!ctx) {
    throw new Error('useMicCaptionStatus must be used within MicCaptionStatusProvider');
  }
  return ctx;
};

export const MicCaptionStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<MicCaptionStatus>(DEFAULT_STATUS);

  const updateStatus = useCallback((updates: Partial<MicCaptionStatus>) => {
    setStatus((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetStatus = useCallback(() => {
    setStatus(DEFAULT_STATUS);
  }, []);

  const value = useMemo(() => ({ status, updateStatus, resetStatus }), [resetStatus, status, updateStatus]);

  React.useEffect(() => {
    const ws = getWebSocketClient();
    ws.connect().catch(() => {
      // ignore; sender will connect too
    });

    const unsubTranscript = ws.on('mic_transcript', (data: any) => {
      const text = String(data?.text || '').trim();
      if (!text) return;
      const ts = typeof data?.timestamp_ms === 'number' ? data.timestamp_ms : Date.now();
      if (data?.is_interim) {
        updateStatus({ lastInterimText: text, lastUpdatedAtMs: ts, error: null });
      } else {
        updateStatus({ lastFinalText: text, lastInterimText: '', lastUpdatedAtMs: ts, error: null });
      }
    });

    const unsubTranslation = ws.on('mic_transcript_translation', (data: any) => {
      // Translation receipt is a good signal that mic pipeline is alive; clear stale errors.
      const translation = String(data?.translation || '').trim();
      if (!translation) return;
      updateStatus({ lastTranslationText: translation, lastUpdatedAtMs: Date.now(), error: null });
    });

    return () => {
      unsubTranscript();
      unsubTranslation();
    };
  }, [updateStatus]);

  return (
    <MicCaptionStatusContext.Provider value={value}>
      {children}
    </MicCaptionStatusContext.Provider>
  );
};
