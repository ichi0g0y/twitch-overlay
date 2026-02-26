import { useEffect } from 'react';
import {
  ChromeTranslatorClient,
  type ChromeTranslationDownloadStatus,
} from '../../../utils/chromeTranslator';
import { getWebSocketClient } from '../../../utils/websocket';
import type { RecState } from './types';

const useAutoCaptureToggleEffect = ({
  speechSupported,
  enabledSetting,
  capturing,
  recState,
  startCapture,
  stopCapture,
}: {
  speechSupported: boolean;
  enabledSetting: boolean;
  capturing: boolean;
  recState: RecState;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}) => {
  useEffect(() => {
    if (!speechSupported) return;
    if (enabledSetting && !capturing && recState === 'stopped') {
      void startCapture();
      return;
    }
    if (!enabledSetting && capturing) stopCapture();
  }, [capturing, enabledSetting, recState, speechSupported, startCapture, stopCapture]);
};

const useWebSocketStatusEffect = ({
  updateStatus,
}: {
  updateStatus: (partial: any) => void;
}) => {
  useEffect(() => {
    const ws = getWebSocketClient();
    ws.connect().catch(() => {});
    updateStatus({ wsConnected: ws.isConnected });
    const unsubConnect = ws.onConnect(() => updateStatus({ wsConnected: true }));
    const unsubDisconnect = ws.onDisconnect(() => updateStatus({ wsConnected: false }));
    return () => { unsubConnect(); unsubDisconnect(); };
  }, [updateStatus]);
};

const useTranslatorClientEffect = ({
  setDownloadStatus,
  translatorRef,
  setTranslatorSupported,
}: {
  setDownloadStatus: (status: ChromeTranslationDownloadStatus | null) => void;
  translatorRef: { current: ChromeTranslatorClient | null };
  setTranslatorSupported: (supported: boolean) => void;
}) => {
  useEffect(() => {
    const client = new ChromeTranslatorClient({ onDownloadStatusChange: (status) => setDownloadStatus(status) });
    translatorRef.current = client;
    setTranslatorSupported(client.isSupported());
    return () => {
      void client.destroy();
      translatorRef.current = null;
    };
  }, [setDownloadStatus, setTranslatorSupported, translatorRef]);
};

const useRecognitionLanguageSyncEffect = ({
  recognitionsRef,
  speechLang,
}: {
  recognitionsRef: { current: any[] };
  speechLang: string;
}) => {
  useEffect(() => {
    recognitionsRef.current.forEach((rec) => {
      try { if (rec) rec.lang = speechLang; } catch {}
    });
  }, [recognitionsRef, speechLang]);
};

const useStatusPublishEffect = ({
  updateStatus,
  capturing,
  recState,
  speechSupported,
  speechLang,
  dualInstanceEnabled,
  translationEnabled,
  translationTargets,
  translatorSupported,
  downloadStatus,
  antiSexualEnabled,
  bouyomiEnabled,
  error,
}: {
  updateStatus: (partial: any) => void;
  capturing: boolean;
  recState: RecState;
  speechSupported: boolean;
  speechLang: string;
  dualInstanceEnabled: boolean;
  translationEnabled: boolean;
  translationTargets: string[];
  translatorSupported: boolean;
  downloadStatus: ChromeTranslationDownloadStatus | null;
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  error: string | null;
}) => {
  useEffect(() => {
    updateStatus({
      capturing,
      recState,
      speechSupported,
      speechLang,
      dualInstanceEnabled,
      translationEnabled,
      translationTargets,
      translatorSupported,
      downloadStatus,
      antiSexualEnabled,
      bouyomiEnabled,
      error,
    });
  }, [
    antiSexualEnabled,
    bouyomiEnabled,
    capturing,
    downloadStatus,
    dualInstanceEnabled,
    error,
    recState,
    speechLang,
    speechSupported,
    translationEnabled,
    translationTargets,
    translatorSupported,
    updateStatus,
  ]);
};

export const useMicCaptionControllerEffects = ({
  speechSupported,
  enabledSetting,
  capturing,
  recState,
  startCapture,
  stopCapture,
  updateStatus,
  setDownloadStatus,
  translatorRef,
  setTranslatorSupported,
  recognitionsRef,
  speechLang,
  antiSexualEnabled,
  bouyomiEnabled,
  translationEnabled,
  translationTargets,
  downloadStatus,
  dualInstanceEnabled,
  translatorSupported,
  error,
}: {
  speechSupported: boolean;
  enabledSetting: boolean;
  capturing: boolean;
  recState: RecState;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  updateStatus: (partial: any) => void;
  setDownloadStatus: (status: ChromeTranslationDownloadStatus | null) => void;
  translatorRef: { current: ChromeTranslatorClient | null };
  setTranslatorSupported: (supported: boolean) => void;
  recognitionsRef: { current: any[] };
  speechLang: string;
  antiSexualEnabled: boolean;
  bouyomiEnabled: boolean;
  translationEnabled: boolean;
  translationTargets: string[];
  downloadStatus: ChromeTranslationDownloadStatus | null;
  dualInstanceEnabled: boolean;
  translatorSupported: boolean;
  error: string | null;
}) => {
  useAutoCaptureToggleEffect({ speechSupported, enabledSetting, capturing, recState, startCapture, stopCapture });
  useWebSocketStatusEffect({ updateStatus });
  useTranslatorClientEffect({ setDownloadStatus, translatorRef, setTranslatorSupported });
  useRecognitionLanguageSyncEffect({ recognitionsRef, speechLang });
  useEffect(() => stopCapture, [stopCapture]);
  useStatusPublishEffect({
    updateStatus,
    capturing,
    recState,
    speechSupported,
    speechLang,
    dualInstanceEnabled,
    translationEnabled,
    translationTargets,
    translatorSupported,
    downloadStatus,
    antiSexualEnabled,
    bouyomiEnabled,
    error,
  });
};
