import React, { createContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DeleteFont, GenerateFontPreview, GetAllSettings, GetAuthURL, GetFeatureStatus,
  GetPrinterStatus, GetServerPort, GetSystemPrinters, ReconnectPrinter,
  ResetNotificationWindowPosition,
  ScanBluetoothDevices,
  TestNotification,
  TestPrint,
  UpdateSettings, UploadFont
} from '../../bindings/github.com/nantokaworks/twitch-overlay/app.js';
import { Browser, Events } from '@wailsio/runtime';
import { useSettings } from '../contexts/SettingsContext';
import {
  AuthStatus,
  BluetoothDevice,
  FeatureStatus, PrinterStatusInfo,
  StreamStatus,
  SystemPrinter,
  TestResponse,
  TwitchUserInfo, UpdateSettingsRequest
} from '../types';
import { buildApiUrl, buildApiUrlAsync } from '../utils/api';

const SETTINGS_TAB_KEY = 'settingsPage.activeTab';

export const SettingsPageContext = createContext<ReturnType<typeof useSettingsPage> | null>(null);

export const useSettingsPage = () => {
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
  const [resettingNotificationPosition, setResettingNotificationPosition] = useState(false);
  const [verifyingTwitch, setVerifyingTwitch] = useState(false);
  const [webServerError, setWebServerError] = useState<{ error: string; port: number } | null>(null);
  const [webServerPort, setWebServerPort] = useState<number>(8080);

  // Font related
  const [uploadingFont, setUploadingFont] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('サンプルテキスト Sample Text 123\nフォントプレビュー 🎨');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Bluetooth related
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);

  // System printer related (USB)
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [loadingSystemPrinters, setLoadingSystemPrinters] = useState(false);

  // Show/hide secrets
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

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
      const allSettings = await GetAllSettings();
      const formattedSettings: Record<string, any> = {};
      for (const [key, value] of Object.entries(allSettings)) {
        formattedSettings[key] = {
          key: key,
          value: value,
          type: 'normal',
          required: false,
          description: '',
          has_value: value !== null && value !== undefined && value !== ''
        };
      }
      setSettings(formattedSettings);

      const status = await GetFeatureStatus();
      setFeatureStatus(status as FeatureStatus);
    } catch (err: any) {
      console.error('[fetchAllSettings] Failed to fetch settings:', err);
      toast.error('設定の取得に失敗しました: ' + err.message);
    }
  };

  const fetchAuthStatus = async () => {
    try {
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/settings/auth/status`);
      const data: AuthStatus = await response.json();
      setAuthStatus(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  };

  const fetchStreamStatus = async (showToast = false) => {
    try {
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/stream/status`);
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
      const status = await GetPrinterStatus();
      const printerType = status.printer_type || 'bluetooth';
      const printerAddress = status.address || '';
      const usbPrinterName = status.usb_printer_name || '';
      const configured = printerType === 'usb' ? !!usbPrinterName : !!printerAddress;
      setPrinterStatusInfo({
        connected: status.connected || false,
        printer_address: printerAddress,
        printer_type: printerType,
        usb_printer_name: usbPrinterName,
        dry_run_mode: false,
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

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      handleAutoSave(key, stringValue);
    }, 1500);
  };

  const handleAutoSave = async (key: string, value: string) => {
    try {
      await UpdateSettings({ [key]: value });

      // OVERLAY_CARDS_EXPANDED以外の設定のみトーストを表示
      if (key !== 'OVERLAY_CARDS_EXPANDED') {
        toast.success(`設定を保存しました: ${key}`);
      }

      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], value: value }
      }));
      setUnsavedChanges(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    } catch (err: any) {
      console.error(`[handleAutoSave] Failed to save ${key}:`, err);
      toast.error('設定の保存に失敗しました: ' + err.message);
    }
  };

  const getSettingValue = (key: string): string => {
    return (key in unsavedChanges) ? unsavedChanges[key] : (settings[key]?.value || '');
  };

  const getBooleanValue = (key: string): boolean => getSettingValue(key) === 'true';

  const handleTwitchAuth = async () => {
    try {
      const authUrl = await GetAuthURL();
      Browser.OpenURL(authUrl);
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
      const port = await GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/twitch/verify`);
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
      await ReconnectPrinter();
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
      TestPrint();
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
      await TestNotification();
      toast.success('テスト通知を送信しました');
    } catch (err: any) {
      toast.error(`テスト通知エラー: ${err.message}`);
    } finally {
      setTestingNotification(false);
    }
  };

  const handleResetNotificationPosition = async () => {
    setResettingNotificationPosition(true);
    try {
      await ResetNotificationWindowPosition();
      toast.success('通知ウィンドウの位置をリセットしました');
    } catch (err: any) {
      toast.error(`位置リセットエラー: ${err.message}`);
    } finally {
      setResettingNotificationPosition(false);
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
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          if (!base64) throw new Error('Failed to read file');
          await UploadFont(file.name, base64);
          toast.success(`フォント「${file.name}」をアップロードしました`);
          await fetchAllSettings();
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
          toast.error('フォントのアップロードに失敗しました: ' + err.message);
        } finally {
          setUploadingFont(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingFont(false);
    }
  };

  const handleDeleteFont = async () => {
    try {
      await DeleteFont();
      toast.success('フォントを削除しました');
      handleSettingChange('FONT_FILENAME', '');
      await fetchAllSettings();
    } catch (err: any) {
      toast.error('フォントの削除に失敗しました: ' + err.message);
    }
  };

  const handleFontPreview = async () => {
    try {
      const image = await GenerateFontPreview(previewText);
      if (image) {
        setPreviewImage(image);
        toast.success('プレビューを生成しました');
      }
    } catch (err: any) {
      toast.error('プレビューの生成に失敗しました: ' + err.message);
    }
  };

  const handleOpenOverlay = async () => {
    const port = await GetServerPort();
    Browser.OpenURL(`http://localhost:${port}/`);
  };

  const handleOpenOverlayDebug = async () => {
    const port = await GetServerPort();
    Browser.OpenURL(`http://localhost:${port}/?debug=true`);
  };

  const handleOpenPresent = async () => {
    const port = await GetServerPort();
    Browser.OpenURL(`http://localhost:${port}/present`);
  };

  const handleOpenPresentDebug = async () => {
    const port = await GetServerPort();
    Browser.OpenURL(`http://localhost:${port}/present?debug=true`);
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
      const devices = await ScanBluetoothDevices();
      const bluetoothDevices: BluetoothDevice[] = devices.map(d => ({
        mac_address: d.mac_address as string,
        name: d.name as string,
        last_seen: d.last_seen as string
      }));

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
      // Wails バインディング経由で TestPrint() を直接呼び出し
      await TestPrint();
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
      const printers = await GetSystemPrinters();
      setSystemPrinters(printers || []);
      if (printers && printers.length > 0) {
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
      const url = await buildApiUrlAsync(`/api/music/control/${command}`);
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

    const unsubscribePrinter = Events.On('printer_connected', () => {
      fetchAllSettings();
      fetchPrinterStatus();
    });

    const unsubscribeWebError = Events.On('webserver_error', (data: { error: string; port: number }) => {
      setWebServerError(data);
      toast.error(`Webサーバーの起動に失敗しました: ${data.error}`);
    });

    const unsubscribeWebStarted = Events.On('webserver_started', (data: { port: number }) => {
      setWebServerError(null);
      setWebServerPort(data.port);
      toast.success(`Webサーバーがポート ${data.port} で起動しました`);
    });

    return () => {
      unsubscribePrinter();
      unsubscribeWebError();
      unsubscribeWebStarted();
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
    resettingNotificationPosition,
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
    handleResetNotificationPosition,
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
