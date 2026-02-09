import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '../contexts/SettingsContext';
import {
  AuthStatus,
  BluetoothDevice,
  FeatureStatus, PrinterStatusInfo,
  MicDevice,
  StreamStatus,
  SystemPrinter,
  TestResponse,
  TwitchUserInfo, UpdateSettingsRequest
} from '../types';
import { buildApiUrl } from '../utils/api';
import { getWebSocketClient } from '../utils/websocket';

const SETTINGS_TAB_KEY = 'settingsPage.activeTab';

export const SettingsPageContext = createContext<ReturnType<typeof useSettingsPage> | null>(null);

const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const data = JSON.parse(text) as { detail?: string; error?: string; message?: string };
      const detail = data.detail || data.error || data.message;
      if (detail) {
        return `HTTP ${response.status}: ${detail}`;
      }
    } catch {
      // ignore json parse errors
    }
    return `HTTP ${response.status}: ${text}`;
  } catch {
    return fallback;
  }
};

export const useSettingsPage = () => {
  type OllamaModelItem = { id: string; size_bytes?: number | null; modified_at?: string };
  type OllamaStatus = { running: boolean; healthy: boolean; version?: string; model?: string; error?: string };
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_TAB_KEY) || 'general';
    } catch {
      return 'general';
    }
  });

  // Core state
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [twitchUserInfo, setTwitchUserInfo] = useState<TwitchUserInfo | null>(null);
  const [printerStatusInfo, setPrinterStatusInfo] = useState<PrinterStatusInfo | null>(null);

  // UI state
  const [unsavedChanges, setUnsavedChanges] = useState<UpdateSettingsRequest>({});
  const [refreshingStreamStatus, setRefreshingStreamStatus] = useState(false);
  const [reconnectingPrinter, setReconnectingPrinter] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [verifyingTwitch, setVerifyingTwitch] = useState(false);
  const [webServerError, setWebServerError] = useState<{ error: string; port: number } | null>(null);
  const [webServerPort, setWebServerPort] = useState<number>(8080);

  // Font related
  const [uploadingFont, setUploadingFont] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('サンプルテキスト Sample Text 123\nフォントプレビュー 🎨');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const settingsRef = useRef<Record<string, any>>({});
  const unsavedChangesRef = useRef<UpdateSettingsRequest>({});

  // Bluetooth related
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);

  // System printer related (USB)
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [loadingSystemPrinters, setLoadingSystemPrinters] = useState(false);

  // Mic devices
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [loadingMicDevices, setLoadingMicDevices] = useState(false);
  const [restartingMicRecog, setRestartingMicRecog] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelItem[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const [ollamaModelsFetchedAt, setOllamaModelsFetchedAt] = useState<number | null>(null);
  const [pullingOllamaModel, setPullingOllamaModel] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [creatingOllamaModelfile, setCreatingOllamaModelfile] = useState(false);
  const [ollamaModelfilePreview, setOllamaModelfilePreview] = useState('');
  const [ollamaModelfileError, setOllamaModelfileError] = useState<string | null>(null);
  const chatTestStorageKeys = {
    text: 'settings.chatTest.text',
  };
  const translationTestStorageKeys = {
    text: 'settings.translationTest.text',
    source: 'settings.translationTest.source',
    target: 'settings.translationTest.target',
  };
  const readStoredValue = (key: string, fallback: string) => {
    try {
      const value = localStorage.getItem(key);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const [translationTestText, setTranslationTestText] = useState(() =>
    readStoredValue(translationTestStorageKeys.text, 'こんにちは'),
  );
  const [translationTestSourceLang, setTranslationTestSourceLang] = useState(() =>
    readStoredValue(translationTestStorageKeys.source, ''),
  );
  const [translationTestTargetLang, setTranslationTestTargetLang] = useState(() =>
    readStoredValue(translationTestStorageKeys.target, 'eng'),
  );
  const [translationTestResult, setTranslationTestResult] = useState<string>('');
  const [translationTestTookMs, setTranslationTestTookMs] = useState<number | null>(null);
  const [translationTesting, setTranslationTesting] = useState(false);
  const [chatTestText, setChatTestText] = useState(() =>
    readStoredValue(chatTestStorageKeys.text, 'こんにちは'),
  );
  const [chatTestResult, setChatTestResult] = useState<string>('');
  const [chatTestTookMs, setChatTestTookMs] = useState<number | null>(null);
  const [chatTesting, setChatTesting] = useState(false);

  // Show/hide secrets
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    unsavedChangesRef.current = unsavedChanges;
  }, [unsavedChanges]);

  const getSettingValueLive = useCallback((key: string): string => {
    const pending = unsavedChangesRef.current;
    if (Object.prototype.hasOwnProperty.call(pending, key)) {
      return String((pending as any)[key] ?? '');
    }
    return String(settingsRef.current[key]?.value ?? '');
  }, []);

  const getSettingValue = (key: string): string => {
    return (key in unsavedChanges) ? unsavedChanges[key] : (settings[key]?.value || '');
  };

  // Overlay settings
  const { settings: overlaySettings, updateSettings: updateOverlaySettings } = useSettings();

  // Music related
  const [musicStatus, setMusicStatus] = useState<{
    is_playing: boolean;
    current_track: any | null;
    current_time: number;
    duration: number;
    volume: number;
    playlist_name?: string;
  }>({
    is_playing: false,
    current_track: null,
    current_time: 0,
    duration: 0,
    volume: 100
  });
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isControlDisabled, setIsControlDisabled] = useState(false);
  const seekBarRef = useRef<HTMLInputElement>(null);

  // Save active tab
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, activeTab);
    } catch (error) {
      console.error('Failed to save active tab:', error);
    }
  }, [activeTab]);

  // Core functions
  const fetchAllSettings = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/v2'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const nextSettings = payload?.settings || {};
      setSettings(nextSettings);
      setFeatureStatus(payload?.status || null);

      // Prefer the port we are actually connected to.
      const portFromLocation = window.location.port ? Number.parseInt(window.location.port, 10) : NaN;
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

  // moved below handleSettingChange to avoid TDZ issues

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
        configured
      });
    } catch (err) {
      console.error('Failed to fetch printer status:', err);
    }
  };

  // Handler functions
  const handleSettingChange = (key: string, value: string | boolean | number) => {
    const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    setUnsavedChanges(prev => ({ ...prev, [key]: stringValue }));

    // Browser notifications require an explicit user gesture to request permission.
    if (key === 'NOTIFICATION_ENABLED' && value === true && typeof window !== 'undefined') {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {
            // ignore
          });
        }
      } catch {
        // ignore
      }
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      handleAutoSave(key, stringValue);
    }, 1500);
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
            continue;
          }
          if (v && typeof v === 'object' && 'value' in v) {
            updates[k] = String((v as any).value ?? '');
          }
        }
      }
      if (Object.keys(updates).length === 0) {
        updates[key] = value;
      }
      applySavedSettings(updates);

      // OVERLAY_CARDS_EXPANDED以外の設定のみトーストを表示
      if (key !== 'OVERLAY_CARDS_EXPANDED') {
        toast.success(`設定を保存しました: ${key}`);
      }
    } catch (err: any) {
      console.error(`[handleAutoSave] Failed to save ${key}:`, err);
      toast.error('設定の保存に失敗しました: ' + err.message);
    }
  };

  const applySavedSettings = (updates: Record<string, string>) => {
    setSettings(prev => {
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
    setUnsavedChanges(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updates)) {
        delete updated[key];
      }
      return updated;
    });
  };

  const fetchOllamaStatus = useCallback(async (silent?: boolean): Promise<OllamaStatus | null> => {
    try {
      const response = await fetch(buildApiUrl('/api/ollama/status'));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const status = {
        running: Boolean(data?.running),
        healthy: Boolean(data?.healthy),
        version: data?.version,
        model: data?.model,
        error: data?.error,
      };
      setOllamaStatus(status);
      return status;
    } catch (err: any) {
      const status = {
        running: false,
        healthy: false,
        error: err?.message || 'ollama status failed',
      };
      setOllamaStatus(status);
      if (!silent) {
        toast.error(`Ollama状態の取得に失敗しました: ${status.error}`);
      }
      return status;
    }
  }, []);

  const fetchOllamaModels = useCallback(async (options?: { silent?: boolean }) => {
    setOllamaModelsLoading(true);
    setOllamaModelsError(null);
    try {
      const status = await fetchOllamaStatus(true);
      if (!status?.healthy) {
        const message = status?.error ? `Ollama未接続: ${status.error}` : 'Ollama未接続';
        throw new Error(message);
      }

      const response = await fetch(buildApiUrl('/api/ollama/models'));
      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }
      const data = await response.json();
      const models: OllamaModelItem[] = Array.isArray(data?.models)
        ? data.models
            .map((item: any) => {
              if (!item) return null;
              const id = item.id || item.name;
              if (!id) return null;
              const size = item.size_bytes ?? item.size ?? null;
              return {
                id,
                size_bytes: typeof size === 'number' ? size : null,
                modified_at: item.modified_at,
              };
            })
            .filter((item: any) => item)
        : [];
      setOllamaModels(models);
      if (data?.cached_at) {
        setOllamaModelsFetchedAt(Number(data.cached_at));
      }
    } catch (err: any) {
      console.error('[fetchOllamaModels] Failed to fetch ollama models:', err);
      const message = err?.message || 'Failed to fetch models';
      setOllamaModelsError(message);
      if (!options?.silent) {
        toast.error(`モデル一覧の取得に失敗しました: ${message}`);
      }
    } finally {
      setOllamaModelsLoading(false);
    }
  }, [fetchOllamaStatus]);

  const pullOllamaModel = useCallback(async (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setPullingOllamaModel(true);
    try {
      const status = await fetchOllamaStatus(true);
      if (!status?.healthy) {
        const message = status?.error ? `Ollama未接続: ${status.error}` : 'Ollama未接続';
        throw new Error(message);
      }
      const response = await fetch(buildApiUrl('/api/ollama/pull'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: trimmed }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }
      toast.success(`モデルを取得しました: ${trimmed}`);
      await fetchOllamaModels({ silent: true });
    } catch (err: any) {
      console.error('[pullOllamaModel] Failed to pull model:', err);
      toast.error(`モデル取得に失敗しました: ${err?.message || 'unknown error'}`);
    } finally {
      setPullingOllamaModel(false);
    }
  }, [fetchOllamaStatus, fetchOllamaModels]);

  const handleTestTranslation = useCallback(async () => {
    const text = translationTestText.trim();
    if (!text) {
      toast.error('テスト文を入力してください');
      return;
    }
    setTranslationTesting(true);
    try {
      const translationSettingsPayload = {
        OLLAMA_BASE_URL: getSettingValue('OLLAMA_BASE_URL'),
        OLLAMA_MODEL: getSettingValue('OLLAMA_MODEL'),
        OLLAMA_NUM_PREDICT: getSettingValue('OLLAMA_NUM_PREDICT'),
        OLLAMA_TEMPERATURE: getSettingValue('OLLAMA_TEMPERATURE'),
        OLLAMA_TOP_P: getSettingValue('OLLAMA_TOP_P'),
        OLLAMA_NUM_CTX: getSettingValue('OLLAMA_NUM_CTX'),
        OLLAMA_STOP: getSettingValue('OLLAMA_STOP'),
        OLLAMA_SYSTEM_PROMPT: getSettingValue('OLLAMA_SYSTEM_PROMPT'),
      };
      const responseSettings = await fetch(buildApiUrl('/api/settings/v2'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(translationSettingsPayload),
      });
      if (!responseSettings.ok) {
        throw new Error(await readErrorMessage(responseSettings));
      }
      applySavedSettings(translationSettingsPayload);
      const status = await fetchOllamaStatus(true);
      if (!status?.healthy) {
        const message = status?.error ? `Ollama未接続: ${status.error}` : 'Ollama未接続';
        throw new Error(message);
      }
      const response = await fetch(buildApiUrl('/api/translation/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          src_lang: translationTestSourceLang || undefined,
          tgt_lang: translationTestTargetLang || undefined,
          backend: 'ollama',
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setTranslationTestResult(data?.text || '');
      setTranslationTestTookMs(typeof data?.took_ms === 'number' ? data.took_ms : null);
    } catch (err: any) {
      console.error('[handleTestTranslation] Failed to translate:', err);
      toast.error(`翻訳テストに失敗しました: ${err?.message || 'unknown error'}`);
      setTranslationTestTookMs(null);
    } finally {
      setTranslationTesting(false);
    }
  }, [
    applySavedSettings,
    fetchOllamaStatus,
    getSettingValue,
    translationTestSourceLang,
    translationTestTargetLang,
    translationTestText,
  ]);

  const handleTestChat = useCallback(async () => {
    const text = chatTestText.trim();
    if (!text) {
      toast.error('テスト文を入力してください');
      return;
    }
    setChatTesting(true);
    try {
      const chatSettingsPayload = {
        OLLAMA_BASE_URL: getSettingValue('OLLAMA_BASE_URL'),
        OLLAMA_CHAT_MODEL: getSettingValue('OLLAMA_CHAT_MODEL'),
        OLLAMA_CHAT_NUM_PREDICT: getSettingValue('OLLAMA_CHAT_NUM_PREDICT'),
        OLLAMA_CHAT_TEMPERATURE: getSettingValue('OLLAMA_CHAT_TEMPERATURE'),
        OLLAMA_CHAT_TOP_P: getSettingValue('OLLAMA_CHAT_TOP_P'),
        OLLAMA_CHAT_NUM_CTX: getSettingValue('OLLAMA_CHAT_NUM_CTX'),
        OLLAMA_CHAT_STOP: getSettingValue('OLLAMA_CHAT_STOP'),
        OLLAMA_CHAT_SYSTEM_PROMPT: getSettingValue('OLLAMA_CHAT_SYSTEM_PROMPT'),
      };
      const responseSettings = await fetch(buildApiUrl('/api/settings/v2'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatSettingsPayload),
      });
      if (!responseSettings.ok) {
        throw new Error(await readErrorMessage(responseSettings));
      }
      applySavedSettings(chatSettingsPayload);
      const status = await fetchOllamaStatus(true);
      if (!status?.healthy) {
        const message = status?.error ? `Ollama未接続: ${status.error}` : 'Ollama未接続';
        throw new Error(message);
      }
      const response = await fetch(buildApiUrl('/api/chat/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setChatTestResult(data?.text || '');
      setChatTestTookMs(typeof data?.took_ms === 'number' ? data.took_ms : null);
    } catch (err: any) {
      console.error('[handleTestChat] Failed to chat:', err);
      toast.error(`会話テストに失敗しました: ${err?.message || 'unknown error'}`);
      setChatTestTookMs(null);
    } finally {
      setChatTesting(false);
    }
  }, [applySavedSettings, chatTestText, fetchOllamaStatus, getSettingValue]);

  const handleCreateOllamaModelfile = useCallback(async (apply: boolean) => {
    setCreatingOllamaModelfile(true);
    setOllamaModelfileError(null);
    try {
      const name = (getSettingValue('OLLAMA_CUSTOM_MODEL_NAME') || '').trim();
      if (!name) {
        throw new Error('モデル名を入力してください');
      }
      const settingsPayload: UpdateSettingsRequest = {
        OLLAMA_CUSTOM_MODEL_NAME: name,
        OLLAMA_MODEL: getSettingValue('OLLAMA_MODEL'),
        OLLAMA_BASE_MODEL: getSettingValue('OLLAMA_BASE_MODEL') || getSettingValue('OLLAMA_MODEL'),
        OLLAMA_NUM_PREDICT: getSettingValue('OLLAMA_NUM_PREDICT'),
        OLLAMA_TEMPERATURE: getSettingValue('OLLAMA_TEMPERATURE'),
        OLLAMA_TOP_P: getSettingValue('OLLAMA_TOP_P'),
        OLLAMA_NUM_CTX: getSettingValue('OLLAMA_NUM_CTX'),
        OLLAMA_STOP: getSettingValue('OLLAMA_STOP'),
        OLLAMA_SYSTEM_PROMPT: getSettingValue('OLLAMA_SYSTEM_PROMPT'),
      };
      const responseSettings = await fetch(buildApiUrl('/api/settings/v2'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload),
      });
      if (!responseSettings.ok) {
        throw new Error(await readErrorMessage(responseSettings));
      }
      applySavedSettings(settingsPayload);
      const response = await fetch(buildApiUrl('/api/ollama/modelfile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          create: true,
          apply,
          base_model: settingsPayload.OLLAMA_BASE_MODEL,
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }
      const data = await response.json();
      if (typeof data?.modelfile === 'string') {
        setOllamaModelfilePreview(data.modelfile);
      }
      if (data?.applied && data?.name) {
        applySavedSettings({ OLLAMA_MODEL: data.name });
      }
      toast.success(`Modelfileを生成しました: ${name}`);
      await fetchOllamaModels({ silent: true });
    } catch (err: any) {
      console.error('[handleCreateOllamaModelfile] Failed to create modelfile:', err);
      const message = err?.message || 'unknown error';
      setOllamaModelfileError(message);
      toast.error(`Modelfile生成に失敗しました: ${message}`);
    } finally {
      setCreatingOllamaModelfile(false);
    }
  }, [fetchOllamaModels, getSettingValue, applySavedSettings]);

  React.useEffect(() => {
    let mounted = true;
    const tick = async () => {
      if (!mounted) return;
      await fetchOllamaStatus(true);
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [fetchOllamaStatus]);

  const prevOllamaHealthyRef = useRef(false);
  React.useEffect(() => {
    const wasHealthy = prevOllamaHealthyRef.current;
    const isHealthy = ollamaStatus?.healthy ?? false;
    if (!wasHealthy && isHealthy) {
      setOllamaModelsError(null);
      fetchOllamaModels({ silent: true });
    }
    prevOllamaHealthyRef.current = isHealthy;
  }, [ollamaStatus, fetchOllamaModels]);

  React.useEffect(() => {
    try {
      localStorage.setItem(translationTestStorageKeys.text, translationTestText);
    } catch {
      // ignore storage errors
    }
  }, [translationTestText, translationTestStorageKeys.text]);

  React.useEffect(() => {
    try {
      localStorage.setItem(chatTestStorageKeys.text, chatTestText);
    } catch {
      // ignore storage errors
    }
  }, [chatTestText, chatTestStorageKeys.text]);

  React.useEffect(() => {
    try {
      localStorage.setItem(translationTestStorageKeys.source, translationTestSourceLang);
    } catch {
      // ignore storage errors
    }
  }, [translationTestSourceLang, translationTestStorageKeys.source]);

  React.useEffect(() => {
    try {
      localStorage.setItem(translationTestStorageKeys.target, translationTestTargetLang);
    } catch {
      // ignore storage errors
    }
  }, [translationTestTargetLang, translationTestStorageKeys.target]);

  const getBooleanValue = (key: string): boolean => getSettingValue(key) === 'true';

  const handleTwitchAuth = async () => {
    try {
      // Open the backend auth endpoint in a new tab.
      window.open('/auth', '_blank', 'noopener,noreferrer');
      toast.info('ブラウザでTwitchにログインしてください');
      setTimeout(async () => {
        await fetchAuthStatus();
      }, 5000);
    } catch (error) {
      toast.error('認証URLの取得に失敗しました');
    }
  };

  const handleRefreshStreamStatus = async () => {
    setRefreshingStreamStatus(true);
    await fetchStreamStatus(true);
    setRefreshingStreamStatus(false);
  };

  const verifyTwitchConfig = async () => {
    setVerifyingTwitch(true);
    try {
      const response = await fetch(buildApiUrl('/api/twitch/verify'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const data: TwitchUserInfo = await response.json();
      setTwitchUserInfo(data);
      if (data.verified) {
        toast.success(`Twitch連携確認: ${data.display_name}`);
      }
    } catch (err) {
      toast.error('Twitch連携の検証に失敗しました');
    } finally {
      setVerifyingTwitch(false);
    }
  };

  const handlePrinterReconnect = async () => {
    setReconnectingPrinter(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/reconnect'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('プリンターに再接続しました');
      await fetchPrinterStatus();
    } catch (err: any) {
      toast.error(`再接続エラー: ${err.message}`);
    } finally {
      setReconnectingPrinter(false);
    }
  };

  const handleTestPrint = async () => {
    setTestingPrinter(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/test-print'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('テストプリントを送信しました');
    } catch (err: any) {
      toast.error(`テストプリントエラー: ${err.message}`);
    } finally {
      setTestingPrinter(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    try {
      if (!('Notification' in window)) {
        throw new Error('このブラウザは通知APIに対応していません');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('通知が許可されていません');
      }
      new Notification('Twitch Overlay', {
        body: 'テスト通知だす',
      });
      toast.success('ブラウザ通知を送信しました');
    } catch (err: any) {
      toast.error(`テスト通知エラー: ${err.message}`);
    } finally {
      setTestingNotification(false);
    }
  };

  const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) {
      toast.error('フォントファイルは.ttfまたは.otf形式である必要があります');
      return;
    }
    setUploadingFont(true);
    try {
      const form = new FormData();
      form.append('font', file);
      const response = await fetch(buildApiUrl('/api/settings/font'), {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success(`フォント「${file.name}」をアップロードしました`);
      await fetchAllSettings();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      toast.error('フォントのアップロードに失敗しました: ' + err.message);
    } finally {
      setUploadingFont(false);
    }
  };

  const handleDeleteFont = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/font'), { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('フォントを削除しました');
      handleSettingChange('FONT_FILENAME', '');
      await fetchAllSettings();
    } catch (err: any) {
      toast.error('フォントの削除に失敗しました: ' + err.message);
    }
  };

  const handleFontPreview = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/font/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: previewText }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      if (payload?.image) {
        setPreviewImage(payload.image);
        toast.success('プレビューを生成しました');
      }
    } catch (err: any) {
      toast.error('プレビューの生成に失敗しました: ' + err.message);
    }
  };

  const handleOpenOverlay = async () => {
    window.open('/overlay/', '_blank', 'noopener,noreferrer');
  };

  const handleOpenOverlayDebug = async () => {
    window.open('/overlay/?debug=true', '_blank', 'noopener,noreferrer');
  };

  const handleOpenPresent = async () => {
    window.open('/overlay/present', '_blank', 'noopener,noreferrer');
  };

  const handleOpenPresentDebug = async () => {
    window.open('/overlay/present?debug=true', '_blank', 'noopener,noreferrer');
  };

  // Bluetooth device functions
  const sortBluetoothDevices = (devices: BluetoothDevice[]): BluetoothDevice[] => {
    return devices.sort((a, b) => {
      if (a.name && !b.name) return -1;
      if (!a.name && b.name) return 1;
      if (a.name && b.name) return a.name.localeCompare(b.name);
      return 0;
    });
  };

  const handleScanDevices = async () => {
    setScanning(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/scan'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const rawDevices = Array.isArray(payload?.Devices) ? payload.Devices : payload?.devices;
      const bluetoothDevices: BluetoothDevice[] = Array.isArray(rawDevices) ? rawDevices.map((d: any) => ({
        mac_address: d.mac_address || d.MACAddress,
        name: d.name || d.Name,
        last_seen: d.last_seen || d.LastSeen,
      })) : [];

      const currentAddress = getSettingValue('PRINTER_ADDRESS');
      let updatedDevices = [...bluetoothDevices];

      if (currentAddress && !bluetoothDevices.find(d => d.mac_address === currentAddress)) {
        updatedDevices.unshift({
          mac_address: currentAddress,
          name: '(現在の設定)',
          last_seen: new Date().toISOString()
        });
      }

      const sortedDevices = sortBluetoothDevices(updatedDevices);
      setBluetoothDevices(sortedDevices);
      toast.success(`${bluetoothDevices.length}台のデバイスが見つかりました`);
      await fetchPrinterStatus();
    } catch (err: any) {
      toast.error('デバイススキャンに失敗しました: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleTestConnection = async () => {
    const printerType = getSettingValue('PRINTER_TYPE') || 'bluetooth';

    // プリンタータイプに応じて必要なパラメータをチェック
    if (printerType === 'bluetooth') {
      const printerAddress = getSettingValue('PRINTER_ADDRESS');
      if (!printerAddress) {
        toast.error('プリンターアドレスが選択されていません');
        return;
      }
    } else if (printerType === 'usb') {
      const usbPrinterName = getSettingValue('USB_PRINTER_NAME');
      if (!usbPrinterName) {
        toast.error('USBプリンター名が選択されていません');
        return;
      }
    }

    setTesting(true);
    try {
      // Use test-print as a pragmatic connectivity check (prints a small clock).
      const response = await fetch(buildApiUrl('/api/printer/test-print'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('プリンターとの接続に成功しました');
    } catch (err: any) {
      toast.error('接続テスト失敗: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshSystemPrinters = async () => {
    setLoadingSystemPrinters(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/system-printers'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const printers = Array.isArray(payload?.printers) ? payload.printers : [];
      setSystemPrinters(printers);
      if (printers.length > 0) {
        toast.success(`${printers.length}台のプリンターが見つかりました`);
      } else {
        toast.info('システムプリンターが見つかりませんでした');
      }
    } catch (err: any) {
      console.error('Failed to get system printers:', err);
      toast.error('システムプリンターの取得に失敗しました: ' + err.message);
      setSystemPrinters([]);
    } finally {
      setLoadingSystemPrinters(false);
    }
  };

  const handleRefreshMicDevices = useCallback(async () => {
    setLoadingMicDevices(true);
    try {
      const response = await fetch(buildApiUrl('/api/mic/devices'));
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === 'string') {
            errorMessage = parsed.error;
          }
        } catch {
          // keep raw text
        }
        throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMicDevices(Array.isArray(data.devices) ? data.devices : []);
    } catch (error: any) {
      console.error('Failed to get mic devices:', error);
      toast.error('マイクデバイスの取得に失敗しました: ' + (error?.message || 'unknown error'));
      setMicDevices([]);
    } finally {
      setLoadingMicDevices(false);
    }
  }, []);

  const handleRestartMicRecog = useCallback(async () => {
    setRestartingMicRecog(true);
    try {
      const response = await fetch(buildApiUrl('/api/mic/restart'), { method: 'POST' });
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const data = await response.json();
          if (data && typeof data.error === 'string') {
            errorMessage = data.error;
          }
        } catch {
          // ignore parse error
        }
        throw new Error(errorMessage);
      }
      toast.success('マイク音声認識を再起動しました');
    } catch (error: any) {
      console.error('Failed to restart mic-recog:', error);
      toast.error('マイク音声認識の再起動に失敗しました: ' + (error?.message || 'unknown error'));
    } finally {
      setRestartingMicRecog(false);
    }
  }, []);

  const handleTokenRefresh = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/twitch/refresh-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Token refresh failed');
      }

      if (result.success) {
        toast.success('トークンを更新しました');
        await fetchAuthStatus();
      } else {
        throw new Error(result.error || 'トークンの更新に失敗しました');
      }
    } catch (err: any) {
      toast.error(`トークンの更新に失敗しました: ${err.message}`);
    }
  };

  // Music control functions
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sendMusicControlCommand = async (command: string, data?: any) => {
    try {
      setIsControlDisabled(true);
      const url = buildApiUrl(`/api/music/control/${command}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined
      });

      if (!response.ok) {
        throw new Error(`Control command failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Music control error:', error);
      toast.error(`コマンドエラー: ${error}`);
    } finally {
      setTimeout(() => setIsControlDisabled(false), 300);
    }
  };

  const handleSeek = async (position: number) => {
    await sendMusicControlCommand('seek', { position });
  };

  // Initial data fetch
  useEffect(() => {
    fetchAllSettings();
    fetchAuthStatus();

    let unsubscribePrinterConnected: (() => void) | undefined;
    let unsubscribePrinterDisconnected: (() => void) | undefined;
    let unsubscribeChatNotification: (() => void) | undefined;
    try {
      const ws = getWebSocketClient();
      ws.connect().catch(() => {
        // ignore
      });
      unsubscribePrinterConnected = ws.on('printer_connected', () => {
        fetchAllSettings();
        fetchPrinterStatus();
      });
      unsubscribePrinterDisconnected = ws.on('printer_disconnected', () => {
        fetchAllSettings();
        fetchPrinterStatus();
      });
      unsubscribeChatNotification = ws.on('chat-notification', (data: any) => {
        try {
          if (typeof window === 'undefined') return;
          if (!('Notification' in window)) return;
          if (getSettingValueLive('NOTIFICATION_ENABLED') !== 'true') return;
          if (Notification.permission !== 'granted') return;

          const title = data?.username ? String(data.username) : 'Twitch Overlay';
          const body = data?.message ? String(data.message) : '';
          const options: NotificationOptions = {};
          if (body) options.body = body;
          if (data?.avatarUrl) options.icon = String(data.avatarUrl);
          new Notification(title, options);
        } catch (error) {
          console.error('[SettingsPage] Failed to show browser notification:', error);
        }
      });
    } catch {
      // ignore
    }

    return () => {
      unsubscribePrinterConnected?.();
      unsubscribePrinterDisconnected?.();
      unsubscribeChatNotification?.();
    };
  }, []);

  // プリンター設定済みの場合、プリンター状態を取得
  useEffect(() => {
    if (featureStatus?.printer_configured) {
      fetchPrinterStatus();
    }
  }, [featureStatus?.printer_configured]);

  // Twitch設定済みの場合、配信状態を取得
  useEffect(() => {
    if (featureStatus?.twitch_configured) {
      fetchStreamStatus();
      // 定期的に配信状態を取得
      const interval = setInterval(() => {
        fetchStreamStatus();
      }, 30000); // 30秒ごと
      return () => clearInterval(interval);
    }
  }, [featureStatus?.twitch_configured]);

  // プリンター種類がUSBの場合、システムプリンター一覧を取得
  useEffect(() => {
    const printerType = getSettingValue('PRINTER_TYPE');
    if (printerType === 'usb') {
      handleRefreshSystemPrinters();
    }
  }, [settings['PRINTER_TYPE']?.value]);

  return {
    // State
    activeTab,
    setActiveTab,
    settings,
    featureStatus,
    authStatus,
    streamStatus,
    twitchUserInfo,
    printerStatusInfo,
    unsavedChanges,
    setUnsavedChanges,
    refreshingStreamStatus,
    reconnectingPrinter,
    testingPrinter,
    testingNotification,
    verifyingTwitch,
    webServerError,
    webServerPort,
    uploadingFont,
    previewImage,
    previewText,
    setPreviewText,
    fileInputRef,

    // Functions
    getSettingValue,
    getBooleanValue,
    handleSettingChange,
    handleTwitchAuth,
    handleRefreshStreamStatus,
    verifyTwitchConfig,
    handlePrinterReconnect,
    handleTestPrint,
    handleTestNotification,
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
    handleOpenOverlay,
    handleOpenOverlayDebug,
    handleOpenPresent,
    handleOpenPresentDebug,
    handleTokenRefresh,

    // Bluetooth related
    bluetoothDevices,
    scanning,
    testing,
    handleScanDevices,
    handleTestConnection,

    // System printer related (USB)
    systemPrinters,
    loadingSystemPrinters,
    handleRefreshSystemPrinters,

    // Mic devices
    micDevices,
    loadingMicDevices,
    handleRefreshMicDevices,
    restartingMicRecog,
    handleRestartMicRecog,
    ollamaModels,
    ollamaModelsLoading,
    ollamaModelsError,
    ollamaModelsFetchedAt,
    pullingOllamaModel,
    ollamaStatus,
    creatingOllamaModelfile,
    ollamaModelfilePreview,
    ollamaModelfileError,
    handleCreateOllamaModelfile,
    fetchOllamaModels,
    pullOllamaModel,
    translationTestText,
    setTranslationTestText,
    translationTestSourceLang,
    setTranslationTestSourceLang,
    translationTestTargetLang,
    setTranslationTestTargetLang,
    translationTestResult,
    translationTestTookMs,
    translationTesting,
    handleTestTranslation,
    chatTestText,
    setChatTestText,
    chatTestResult,
    chatTestTookMs,
    chatTesting,
    handleTestChat,

    // Show/hide secrets
    showSecrets,
    setShowSecrets,

    // Overlay settings
    overlaySettings,
    updateOverlaySettings,

    // Music related
    musicStatus,
    setMusicStatus,
    playlists,
    setPlaylists,
    isControlDisabled,
    seekBarRef,
    sendMusicControlCommand,
    handleSeek,
    formatTime,
  };
};
