import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { ALLOWED_TABS, SETTINGS_TAB_KEY } from './constants';
import { createAuxActions } from './createAuxActions';
import { createCoreActions } from './createCoreActions';
import { useSettings } from '../../contexts/SettingsContext';
import { getWebSocketClient } from '../../utils/websocket';
import type {
  AuthStatus,
  BluetoothDevice,
  FeatureStatus,
  PrinterStatusInfo,
  StreamStatus,
  SystemPrinter,
  TwitchUserInfo,
  UpdateSettingsRequest,
} from '../../types';

export const useSettingsPageController = () => {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_TAB_KEY);
      if (stored && ALLOWED_TABS.has(stored)) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return 'general';
  });

  const [settings, setSettings] = useState<Record<string, any>>({});
  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [twitchUserInfo, setTwitchUserInfo] = useState<TwitchUserInfo | null>(null);
  const [printerStatusInfo, setPrinterStatusInfo] = useState<PrinterStatusInfo | null>(null);

  const [unsavedChanges, setUnsavedChanges] = useState<UpdateSettingsRequest>({});
  const [refreshingStreamStatus, setRefreshingStreamStatus] = useState(false);
  const [reconnectingPrinter, setReconnectingPrinter] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [verifyingTwitch, setVerifyingTwitch] = useState(false);
  const [webServerError, setWebServerError] = useState<{ error: string; port: number } | null>(null);
  const [webServerPort, setWebServerPort] = useState<number>(8080);

  const [uploadingFont, setUploadingFont] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [previewText, setPreviewText] = useState('サンプルテキスト Sample Text 123\nフォントプレビュー 🎨');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);

  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [loadingSystemPrinters, setLoadingSystemPrinters] = useState(false);

  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const { settings: overlaySettings, updateSettings: updateOverlaySettings } = useSettings();

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
    volume: 100,
  });
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isControlDisabled, setIsControlDisabled] = useState(false);
  const seekBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, activeTab);
    } catch (error) {
      console.error('Failed to save active tab:', error);
    }
  }, [activeTab]);

  const getSettingValue = useCallback((key: string): string => {
    return key in unsavedChanges ? unsavedChanges[key] : (settings[key]?.value || '');
  }, [settings, unsavedChanges]);

  const coreActions = useMemo(() => createCoreActions({
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
  }), [previewText]);

  const auxActions = useMemo(() => createAuxActions({
    webServerPort,
    getSettingValue,
    setScanning,
    setBluetoothDevices,
    fetchPrinterStatus: coreActions.fetchPrinterStatus,
    setTesting,
    setLoadingSystemPrinters,
    setSystemPrinters,
    fetchAuthStatus: coreActions.fetchAuthStatus,
    setIsControlDisabled,
  }), [
    webServerPort,
    getSettingValue,
    coreActions.fetchPrinterStatus,
    coreActions.fetchAuthStatus,
  ]);

  const getBooleanValue = useMemo(
    () => coreActions.getBooleanValue(getSettingValue),
    [coreActions, getSettingValue],
  );

  useEffect(() => {
    void coreActions.fetchAllSettings();
    void coreActions.fetchAuthStatus();

    let unsubscribePrinterConnected: (() => void) | undefined;
    let unsubscribePrinterDisconnected: (() => void) | undefined;
    const tauriUnlisteners: Promise<(() => void)>[] = [];
    try {
      const ws = getWebSocketClient();
      ws.connect().catch(() => {
        // ignore
      });
      unsubscribePrinterConnected = ws.on('printer_connected', () => {
        void coreActions.fetchAllSettings();
        void coreActions.fetchPrinterStatus();
      });
      unsubscribePrinterDisconnected = ws.on('printer_disconnected', () => {
        void coreActions.fetchAllSettings();
        void coreActions.fetchPrinterStatus();
      });

      const isTauriRuntime = typeof window !== 'undefined'
        && (
          typeof (window as any).__TAURI__ !== 'undefined'
          || typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
        );
      if (isTauriRuntime) {
        tauriUnlisteners.push(listen('printer_connected', () => {
          void coreActions.fetchPrinterStatus();
          toast.success('プリンターが接続されました');
        }));
        tauriUnlisteners.push(listen('printer_error', (event: any) => {
          void coreActions.fetchPrinterStatus();
          toast.error(`プリンターエラー: ${event.payload.message}`);
        }));
        tauriUnlisteners.push(listen('print_success', (event: any) => {
          toast.success(event.payload.dry_run ? '印刷完了 (dry run)' : '印刷完了');
        }));
        tauriUnlisteners.push(listen('print_error', (event: any) => {
          toast.error(`印刷エラー: ${event.payload.message}`);
        }));
        tauriUnlisteners.push(listen('auth_success', () => {
          void coreActions.fetchAuthStatus();
          toast.success('Twitch認証が完了しました');
        }));
        tauriUnlisteners.push(listen('settings_updated', () => {
          void coreActions.fetchAllSettings();
        }));
      }
    } catch {
      // ignore
    }

    return () => {
      unsubscribePrinterConnected?.();
      unsubscribePrinterDisconnected?.();
      tauriUnlisteners.forEach((promise) => {
        Promise.resolve(promise).then((unlisten) => unlisten()).catch(() => undefined);
      });
    };
  }, []);

  useEffect(() => {
    if (featureStatus?.printer_configured) {
      void coreActions.fetchPrinterStatus();
    }
  }, [featureStatus?.printer_configured]);

  useEffect(() => {
    if (featureStatus?.twitch_configured) {
      void coreActions.fetchStreamStatus();
      const interval = setInterval(() => {
        void coreActions.fetchStreamStatus();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [featureStatus?.twitch_configured]);

  useEffect(() => {
    const printerType = getSettingValue('PRINTER_TYPE');
    if (printerType === 'usb') {
      void auxActions.handleRefreshSystemPrinters();
    }
  }, [settings['PRINTER_TYPE']?.value]);

  return {
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

    getSettingValue,
    getBooleanValue,
    handleSettingChange: coreActions.handleSettingChange,
    handleTwitchAuth: coreActions.handleTwitchAuth,
    handleRefreshStreamStatus: coreActions.handleRefreshStreamStatus,
    verifyTwitchConfig: coreActions.verifyTwitchConfig,
    handlePrinterReconnect: coreActions.handlePrinterReconnect,
    handleTestPrint: coreActions.handleTestPrint,
    handleTestNotification: coreActions.handleTestNotification,
    handleFontUpload: coreActions.handleFontUpload,
    handleDeleteFont: coreActions.handleDeleteFont,
    handleFontPreview: coreActions.handleFontPreview,
    handleOpenPresent: auxActions.handleOpenPresent,
    handleOpenPresentDebug: auxActions.handleOpenPresentDebug,
    handleOpenOverlay: auxActions.handleOpenOverlay,
    handleOpenOverlayDebug: auxActions.handleOpenOverlayDebug,
    handleTokenRefresh: auxActions.handleTokenRefresh,

    bluetoothDevices,
    scanning,
    testing,
    handleScanDevices: auxActions.handleScanDevices,
    handleTestConnection: auxActions.handleTestConnection,

    systemPrinters,
    loadingSystemPrinters,
    handleRefreshSystemPrinters: auxActions.handleRefreshSystemPrinters,

    showSecrets,
    setShowSecrets,

    overlaySettings,
    updateOverlaySettings,

    musicStatus,
    setMusicStatus,
    playlists,
    setPlaylists,
    isControlDisabled,
    seekBarRef,
    sendMusicControlCommand: auxActions.sendMusicControlCommand,
    handleSeek: auxActions.handleSeek,
    formatTime: auxActions.formatTime,
  };
};
