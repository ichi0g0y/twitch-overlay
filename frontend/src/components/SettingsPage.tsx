import { Bluetooth, Bug, FileText, Gift, HardDrive, Layers, Mic, Monitor, Music, Settings2, Sparkles, Wifi } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSettingsPage, SettingsPageContext } from '../hooks/useSettingsPage';
import { SystemStatusCard } from './SystemStatusCard';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

// Import tab components
import { GeneralSettings } from './settings/GeneralSettings';
import { AISettings } from './settings/AISettings';
import { MusicSettings } from './settings/MusicSettings';
import { LogsTab } from './settings/LogsTab';
import { TwitchSettings } from './settings/TwitchSettings';
import { PrinterSettings } from './settings/PrinterSettings';
import { OverlaySettings } from './settings/OverlaySettings';
import { ApiTab } from './settings/ApiTab';
import { CacheSettings } from './settings/CacheSettings';
import { MicrophoneSettings } from './settings/MicrophoneSettings';
import { ChatSidebar } from './ChatSidebar';

const SIDEBAR_SIDE_STORAGE_KEY = 'chat_sidebar_side';
const SIDEBAR_WIDTH_STORAGE_KEY = 'chat_sidebar_width';
const SIDEBAR_FONT_SIZE_STORAGE_KEY = 'chat_sidebar_font_size';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_FONT_SIZE = 12;
const SIDEBAR_MAX_FONT_SIZE = 40;
const SIDEBAR_DEFAULT_FONT_SIZE = 14;

export const SettingsPage: React.FC = () => {
  const contextValue = useSettingsPage();
  const [chatSidebarSide, setChatSidebarSide] = useState<'left' | 'right'>(() => {
    if (typeof window === 'undefined') return 'left';
    const stored = window.localStorage.getItem(SIDEBAR_SIDE_STORAGE_KEY);
    return stored === 'right' ? 'right' : 'left';
  });
  const [chatSidebarWidth, setChatSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
  });
  const [chatSidebarFontSize, setChatSidebarFontSize] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_FONT_SIZE;
    const stored = window.localStorage.getItem(SIDEBAR_FONT_SIZE_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_FONT_SIZE;
    return Math.min(SIDEBAR_MAX_FONT_SIZE, Math.max(SIDEBAR_MIN_FONT_SIZE, parsed));
  });
  const {
    activeTab,
    setActiveTab,
    featureStatus,
    authStatus,
    streamStatus,
    twitchUserInfo,
    printerStatusInfo,
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
  } = contextValue;

  const handleChatSidebarSideChange = (side: 'left' | 'right') => {
    setChatSidebarSide(side);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_SIDE_STORAGE_KEY, side);
    }
  };

  const handleChatSidebarWidthChange = (nextWidth: number) => {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, nextWidth));
    setChatSidebarWidth(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    }
  };

  const handleChatSidebarFontSizeChange = (nextSize: number) => {
    const clamped = Math.min(SIDEBAR_MAX_FONT_SIZE, Math.max(SIDEBAR_MIN_FONT_SIZE, nextSize));
    setChatSidebarFontSize(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_FONT_SIZE_STORAGE_KEY, String(clamped));
    }
  };

  const layoutOrders = useMemo(() => {
    return chatSidebarSide === 'left'
      ? { sidebar: 'order-1 lg:order-1', content: 'order-2 lg:order-2' }
      : { sidebar: 'order-1 lg:order-2', content: 'order-2 lg:order-1' };
  }, [chatSidebarSide]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 transition-colors" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="w-full px-4 py-6">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className={layoutOrders.sidebar}>
            <ChatSidebar
              side={chatSidebarSide}
              onSideChange={handleChatSidebarSideChange}
              width={chatSidebarWidth}
              onWidthChange={handleChatSidebarWidthChange}
              fontSize={chatSidebarFontSize}
              onFontSizeChange={handleChatSidebarFontSizeChange}
              translationEnabled={getSettingValue('CHAT_TRANSLATION_ENABLED') !== 'false'}
              onTranslationToggle={(enabled) => handleSettingChange('CHAT_TRANSLATION_ENABLED', enabled)}
              notificationOverwrite={getSettingValue('NOTIFICATION_DISPLAY_MODE') === 'overwrite'}
              onNotificationModeToggle={(enabled) =>
                handleSettingChange('NOTIFICATION_DISPLAY_MODE', enabled ? 'overwrite' : 'queue')}
            />
          </div>
          <div className={`flex-1 min-w-0 ${layoutOrders.content}`}>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-gray-400" />
                  クイック操作
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline"
                    onClick={handleOpenOverlay}
                    className="flex items-center space-x-1">
                    <Monitor className="w-3 h-3" />
                    <span>オーバーレイ表示</span>
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={handleOpenOverlayDebug}
                    className="flex items-center space-x-1">
                    <Bug className="w-3 h-3" />
                    <span>オーバーレイ表示(デバッグ)</span>
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={handleOpenPresent}
                    className="flex items-center space-x-1">
                    <Gift className="w-3 h-3" />
                    <span>プレゼントルーレット</span>
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={handleOpenPresentDebug}
                    className="flex items-center space-x-1">
                    <Gift className="w-3 h-3" />
                    <span>プレゼント(デバッグ)</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
            <SystemStatusCard
              featureStatus={featureStatus}
              authStatus={authStatus}
              streamStatus={streamStatus}
              twitchUserInfo={twitchUserInfo}
              printerStatusInfo={printerStatusInfo}
              webServerPort={webServerPort}
              refreshingStreamStatus={refreshingStreamStatus}
              reconnectingPrinter={reconnectingPrinter}
              testingPrinter={testingPrinter}
              verifyingTwitch={verifyingTwitch}
              onTwitchAuth={handleTwitchAuth}
              onRefreshStreamStatus={handleRefreshStreamStatus}
              onVerifyTwitchConfig={verifyTwitchConfig}
              onPrinterReconnect={handlePrinterReconnect}
              onTestPrint={handleTestPrint}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-10 mb-6">
                <TabsTrigger value="general"><Settings2 className="w-4 h-4 mr-1" />一般</TabsTrigger>
                <TabsTrigger value="ai"><Sparkles className="w-4 h-4 mr-1" />AI</TabsTrigger>
                <TabsTrigger value="twitch"><Wifi className="w-4 h-4 mr-1" />Twitch</TabsTrigger>
                <TabsTrigger value="printer"><Bluetooth className="w-4 h-4 mr-1" />プリンター</TabsTrigger>
                <TabsTrigger value="mic"><Mic className="w-4 h-4 mr-1" />マイク</TabsTrigger>
                <TabsTrigger value="music"><Music className="w-4 h-4 mr-1" />音楽</TabsTrigger>
                <TabsTrigger value="overlay"><Layers className="w-4 h-4 mr-1" />オーバーレイ</TabsTrigger>
                <TabsTrigger value="logs"><FileText className="w-4 h-4 mr-1" />ログ</TabsTrigger>
                <TabsTrigger value="cache"><HardDrive className="w-4 h-4 mr-1" />キャッシュ</TabsTrigger>
                <TabsTrigger value="api"><Bug className="w-4 h-4 mr-1" />API</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <GeneralSettings
                  getSettingValue={getSettingValue}
                  handleSettingChange={handleSettingChange}
                  getBooleanValue={getBooleanValue}
                  webServerError={webServerError}
                  webServerPort={webServerPort}
                  streamStatus={streamStatus}
                  fileInputRef={fileInputRef}
                  uploadingFont={uploadingFont}
                  handleFontUpload={handleFontUpload}
                  previewText={previewText}
                  setPreviewText={setPreviewText}
                  previewImage={previewImage}
                  handleFontPreview={handleFontPreview}
                  handleDeleteFont={handleDeleteFont}
                  handleTestNotification={handleTestNotification}
                  testingNotification={testingNotification}
                />
              </TabsContent>
              <TabsContent value="ai">
                <AISettings
                  getSettingValue={getSettingValue}
                  handleSettingChange={handleSettingChange}
                  ollamaModels={ollamaModels}
                  ollamaModelsLoading={ollamaModelsLoading}
                  ollamaModelsError={ollamaModelsError}
                  ollamaModelsFetchedAt={ollamaModelsFetchedAt}
                  pullingOllamaModel={pullingOllamaModel}
                  creatingOllamaModelfile={creatingOllamaModelfile}
                  ollamaModelfilePreview={ollamaModelfilePreview}
                  ollamaModelfileError={ollamaModelfileError}
                  handleCreateOllamaModelfile={handleCreateOllamaModelfile}
                  fetchOllamaModels={fetchOllamaModels}
                  pullOllamaModel={pullOllamaModel}
                  ollamaStatus={ollamaStatus}
                  translationTestText={translationTestText}
                  setTranslationTestText={setTranslationTestText}
                  translationTestSourceLang={translationTestSourceLang}
                  setTranslationTestSourceLang={setTranslationTestSourceLang}
                  translationTestTargetLang={translationTestTargetLang}
                  setTranslationTestTargetLang={setTranslationTestTargetLang}
                  translationTestResult={translationTestResult}
                  translationTestTookMs={translationTestTookMs}
                  translationTesting={translationTesting}
                  handleTestTranslation={handleTestTranslation}
                  chatTestText={chatTestText}
                  setChatTestText={setChatTestText}
                  chatTestResult={chatTestResult}
                  chatTestTookMs={chatTestTookMs}
                  chatTesting={chatTesting}
                  handleTestChat={handleTestChat}
                />
              </TabsContent>
              <TabsContent value="twitch">
                <SettingsPageContext.Provider value={contextValue}>
                  <TwitchSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="printer">
                <SettingsPageContext.Provider value={contextValue}>
                  <PrinterSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="mic">
                <SettingsPageContext.Provider value={contextValue}>
                  <MicrophoneSettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="music"><MusicSettings /></TabsContent>
              <TabsContent value="overlay">
                <SettingsPageContext.Provider value={contextValue}>
                  <OverlaySettings />
                </SettingsPageContext.Provider>
              </TabsContent>
              <TabsContent value="logs"><LogsTab /></TabsContent>
              <TabsContent value="cache"><CacheSettings /></TabsContent>
              <TabsContent value="api"><ApiTab /></TabsContent>
            </Tabs>
          </div>

        </div>
      </div>
    </div>
  );
};
