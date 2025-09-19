import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DeleteFont, GenerateFontPreview, GetAllSettings, GetAuthURL, GetFeatureStatus,
  GetPrinterStatus, GetServerPort, ReconnectPrinter, RestartWebServer, TestPrint,
  UpdateSettings, UploadFont
} from '../../wailsjs/go/main/App';
import { BrowserOpenURL, EventsOn } from '../../wailsjs/runtime/runtime';
import {
  AuthStatus, FeatureStatus, PrinterStatusInfo,
  StreamStatus, TwitchUserInfo, UpdateSettingsRequest
} from '../types';

const SETTINGS_TAB_KEY = 'settingsPage.activeTab';

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
  const [verifyingTwitch, setVerifyingTwitch] = useState(false);
  const [webServerError, setWebServerError] = useState<{ error: string; port: number } | null>(null);
  const [webServerPort, setWebServerPort] = useState<number>(8080);

  // Font related
  const [uploadingFont, setUploadingFont] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('サンプルテキスト Sample Text 123\nフォントプレビュー 🎨');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

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
      setPrinterStatusInfo({
        connected: status.connected || false,
        printer_address: status.address || '',
        dry_run_mode: false,
        configured: !!status.address
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
      toast.success(`設定を保存しました: ${key}`);
      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], value: value }
      }));
      setUnsavedChanges(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
      await fetchAllSettings();
    } catch (err: any) {
      toast.error('設定の保存に失敗しました: ' + err.message);
    }
  };

  const getSettingValue = (key: string): string => {
    if (key in unsavedChanges) return unsavedChanges[key];
    return settings[key]?.value || '';
  };

  const getBooleanValue = (key: string): boolean => getSettingValue(key) === 'true';

  const handleTwitchAuth = async () => {
    try {
      const authUrl = await GetAuthURL();
      BrowserOpenURL(authUrl);
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

  const handleRestartWebServer = async () => {
    const port = parseInt(getSettingValue('SERVER_PORT') || '8080');
    try {
      toast.info(`Webサーバーをポート ${port} で再起動中...`);
      await RestartWebServer(port);
      setWebServerPort(port);
      setWebServerError(null);
    } catch (error) {
      toast.error(`Webサーバーの再起動に失敗しました: ${error}`);
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
    BrowserOpenURL(`http://localhost:${port}/`);
  };

  // Initial data fetch
  useEffect(() => {
    fetchAllSettings();
    fetchAuthStatus();

    const unsubscribePrinter = EventsOn('printer_connected', () => {
      fetchAllSettings();
      fetchPrinterStatus();
    });

    const unsubscribeWebError = EventsOn('webserver_error', (data: { error: string; port: number }) => {
      setWebServerError(data);
      toast.error(`Webサーバーの起動に失敗しました: ${data.error}`);
    });

    const unsubscribeWebStarted = EventsOn('webserver_started', (data: { port: number }) => {
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
    refreshingStreamStatus,
    reconnectingPrinter,
    testingPrinter,
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
    handleRestartWebServer,
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
    handleOpenOverlay,
  };
};