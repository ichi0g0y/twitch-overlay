import { Bluetooth, Bug, FileText, Layers, Monitor, Moon, Music, Settings2, Sun, Wifi } from 'lucide-react';
import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { useSettingsPage, SettingsPageContext } from '../hooks/useSettingsPage';
import { SystemStatusCard } from './SystemStatusCard';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

// Import tab components
import { GeneralSettings } from './settings/GeneralSettings';
import { MusicSettings } from './settings/MusicSettings';
import { LogsTab } from './settings/LogsTab';
import { TwitchSettings } from './settings/TwitchSettings';
import { PrinterSettings } from './settings/PrinterSettings';
import { OverlaySettings } from './settings/OverlaySettings';
import { ApiTab } from './settings/ApiTab';

export const SettingsPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const contextValue = useSettingsPage();
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
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
    handleOpenOverlay,
  } = contextValue;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <h1 className="text-2xl font-bold dark:text-white">設定</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline"
                  onClick={handleOpenOverlay}
                  className="flex items-center space-x-1">
                  <Monitor className="w-3 h-3" />
                  <span>オーバーレイ表示</span>
                </Button>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <SystemStatusCard
          featureStatus={featureStatus}
          authStatus={authStatus}
          streamStatus={streamStatus}
          twitchUserInfo={twitchUserInfo}
          printerStatusInfo={printerStatusInfo}
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
          <TabsList className="grid w-full grid-cols-7 mb-6">
            <TabsTrigger value="general"><Settings2 className="w-4 h-4 mr-1" />一般</TabsTrigger>
            <TabsTrigger value="twitch"><Wifi className="w-4 h-4 mr-1" />Twitch</TabsTrigger>
            <TabsTrigger value="printer"><Bluetooth className="w-4 h-4 mr-1" />プリンター</TabsTrigger>
            <TabsTrigger value="music"><Music className="w-4 h-4 mr-1" />音楽</TabsTrigger>
            <TabsTrigger value="overlay"><Layers className="w-4 h-4 mr-1" />オーバーレイ</TabsTrigger>
            <TabsTrigger value="logs"><FileText className="w-4 h-4 mr-1" />ログ</TabsTrigger>
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
          <TabsContent value="music"><MusicSettings /></TabsContent>
          <TabsContent value="overlay">
            <SettingsPageContext.Provider value={contextValue}>
              <OverlaySettings />
            </SettingsPageContext.Provider>
          </TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="api"><ApiTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};