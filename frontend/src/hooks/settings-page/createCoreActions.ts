import type React from 'react';
import { toast } from 'sonner';
import type { AuthStatus, StreamStatus, UpdateSettingsRequest } from '../../types';
import { buildApiUrl } from '../../utils/api';
import { createCoreUiActions } from './createCoreUiActions';
import { readErrorMessage } from './http';

type CoreActionDeps = {
  setSettings: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setFeatureStatus: React.Dispatch<React.SetStateAction<any>>;
  setWebServerPort: React.Dispatch<React.SetStateAction<number>>;
  setAuthStatus: React.Dispatch<React.SetStateAction<AuthStatus | null>>;
  setStreamStatus: React.Dispatch<React.SetStateAction<StreamStatus | null>>;
  setPrinterStatusInfo: React.Dispatch<React.SetStateAction<any>>;
  setUnsavedChanges: React.Dispatch<React.SetStateAction<UpdateSettingsRequest>>;
  setRefreshingStreamStatus: React.Dispatch<React.SetStateAction<boolean>>;
  setReconnectingPrinter: React.Dispatch<React.SetStateAction<boolean>>;
  setTestingPrinter: React.Dispatch<React.SetStateAction<boolean>>;
  setTestingNotification: React.Dispatch<React.SetStateAction<boolean>>;
  setVerifyingTwitch: React.Dispatch<React.SetStateAction<boolean>>;
  setTwitchUserInfo: React.Dispatch<React.SetStateAction<any>>;
  setUploadingFont: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewImage: React.Dispatch<React.SetStateAction<string>>;
  previewText: string;
  saveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | undefined>;
  fileInputRef: React.RefObject<HTMLInputElement>;
};

export const createCoreActions = (deps: CoreActionDeps) => {
  const {
    setSettings,
    setFeatureStatus,
    setWebServerPort,
    setAuthStatus,
    setStreamStatus,
    setPrinterStatusInfo,
    setUnsavedChanges,
    setRefreshingStreamStatus,
    setReconnectingPrinter,
    setTestingPrinter,
    setTestingNotification,
    setVerifyingTwitch,
    setTwitchUserInfo,
    setUploadingFont,
    setPreviewImage,
    previewText,
    saveTimeoutRef,
    fileInputRef,
  } = deps;

  const fetchAllSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/v2'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      setSettings(payload?.settings || {});
      setFeatureStatus(payload?.status || null);

      const portFromLocation = window.location.port
        ? Number.parseInt(window.location.port, 10)
        : Number.NaN;
      if (!Number.isNaN(portFromLocation) && portFromLocation > 0) {
        setWebServerPort(portFromLocation);
      } else if (payload?.status?.webserver_port) {
        setWebServerPort(Number(payload.status.webserver_port));
      }
    } catch (err: any) {
      console.error('[fetchAllSettings] Failed to fetch settings:', err);
      toast.error('設定の取得に失敗しました: ' + err.message);
    }
  };

  const fetchAuthStatus = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/auth/status'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const data: AuthStatus = await response.json();
      setAuthStatus(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  };

  const fetchStreamStatus = async (showToast = false) => {
    try {
      const response = await fetch(buildApiUrl('/api/stream/status'));
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: StreamStatus = await response.json();
      setStreamStatus(data);
      if (showToast) toast.success('配信状態を更新しました');
    } catch (err) {
      console.error('Failed to fetch stream status:', err);
      setStreamStatus({ is_live: false, viewer_count: 0, last_checked: new Date().toISOString() });
      if (showToast) toast.error('配信状態の取得に失敗しました');
    }
  };

  const fetchPrinterStatus = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/printer/status'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const status = await response.json();
      const printerType = status.printer_type || 'bluetooth';
      const printerAddress = status.printer_address || '';
      const usbPrinterName = status.usb_printer_name || '';
      const configured = Boolean(status.configured) || (printerType === 'usb' ? !!usbPrinterName : !!printerAddress);
      setPrinterStatusInfo({
        connected: Boolean(status.connected),
        printer_address: printerAddress,
        printer_type: printerType,
        usb_printer_name: usbPrinterName,
        dry_run_mode: Boolean(status.dry_run_mode),
        configured,
      });
    } catch (err) {
      console.error('Failed to fetch printer status:', err);
    }
  };

  const applySavedSettings = (updates: Record<string, string>) => {
    setSettings((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(updates)) {
        const existing = next[key];
        next[key] = {
          key,
          value,
          type: existing?.type || 'normal',
          required: existing?.required || false,
          description: existing?.description || '',
          has_value: value !== '',
        };
      }
      return next;
    });
    setUnsavedChanges((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updates)) {
        delete updated[key];
      }
      return updated;
    });
  };

  const handleAutoSave = async (key: string, value: string) => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/v2'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      if (payload?.status) {
        setFeatureStatus(payload.status);
      }
      const updates: Record<string, string> = {};
      if (payload?.settings && typeof payload.settings === 'object') {
        for (const [k, v] of Object.entries(payload.settings as Record<string, any>)) {
          if (typeof v === 'string') {
            updates[k] = v;
          } else if (v && typeof v === 'object' && 'value' in v) {
            updates[k] = String((v as any).value ?? '');
          }
        }
      }
      if (Object.keys(updates).length === 0) {
        updates[key] = value;
      }
      applySavedSettings(updates);

      if (key !== 'OVERLAY_CARDS_EXPANDED') {
        toast.success(`設定を保存しました: ${key}`);
      }
    } catch (err: any) {
      console.error(`[handleAutoSave] Failed to save ${key}:`, err);
      toast.error('設定の保存に失敗しました: ' + err.message);
    }
  };

  const handleSettingChange = (key: string, value: string | boolean | number) => {
    const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    setUnsavedChanges((prev) => ({ ...prev, [key]: stringValue }));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void handleAutoSave(key, stringValue);
    }, 1500);
  };

  const getBooleanValue = (getSettingValue: (key: string) => string) => {
    return (key: string): boolean => getSettingValue(key) === 'true';
  };

  const uiActions = createCoreUiActions({
    setRefreshingStreamStatus,
    setVerifyingTwitch,
    setTwitchUserInfo,
    setReconnectingPrinter,
    setTestingPrinter,
    setTestingNotification,
    setUploadingFont,
    setPreviewImage,
    previewText,
    fileInputRef,
    fetchAuthStatus,
    fetchStreamStatus,
    fetchPrinterStatus,
    fetchAllSettings,
    handleSettingChange,
  });

  return {
    fetchAllSettings,
    fetchAuthStatus,
    fetchStreamStatus,
    fetchPrinterStatus,
    handleSettingChange,
    getBooleanValue,
    ...uiActions,
  };
};
