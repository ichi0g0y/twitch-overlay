import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, Radio } from "lucide-react";
import { FeatureStatus, AuthStatus, StreamStatus, TwitchUserInfo, PrinterStatusInfo } from '@/types';

interface SystemStatusCardProps {
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  streamStatus: StreamStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  printerStatusInfo: PrinterStatusInfo | null;
  webServerPort?: number;
  refreshingStreamStatus: boolean;
  reconnectingPrinter: boolean;
  testingPrinter: boolean;
  verifyingTwitch: boolean;
  onTwitchAuth: () => void;
  onRefreshStreamStatus: () => void;
  onVerifyTwitchConfig: () => void;
  onPrinterReconnect: () => void;
  onTestPrint: () => void;
}

export const SystemStatusCard: React.FC<SystemStatusCardProps> = ({
  featureStatus,
  authStatus,
  streamStatus,
  twitchUserInfo,
  printerStatusInfo,
  webServerPort,
  refreshingStreamStatus,
  reconnectingPrinter,
  testingPrinter,
  verifyingTwitch,
  onTwitchAuth,
  onRefreshStreamStatus,
  onVerifyTwitchConfig,
  onPrinterReconnect,
  onTestPrint,
}) => {
  const resolvedWebServerPort = React.useMemo(() => {
    if (typeof webServerPort === 'number' && webServerPort > 0) {
      return webServerPort;
    }
    if (typeof window === 'undefined') return undefined;
    const fromLocation = window.location.port ? Number.parseInt(window.location.port, 10) : NaN;
    if (!Number.isNaN(fromLocation) && fromLocation > 0) {
      return fromLocation;
    }
    return undefined;
  }, [webServerPort]);

  if (!featureStatus) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="text-left">
        <CardTitle className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-gray-400" />
          システム状態
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Twitch連携状態 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${featureStatus.twitch_configured ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium dark:text-gray-200">Twitch連携</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {featureStatus.twitch_configured ? '設定済み' : '未設定'}
              </span>
            </div>

            {/* 配信状態表示（Twitch設定済みなら常に表示） */}
            {featureStatus.twitch_configured && (
              <div className="ml-5 text-sm">
                <div className="flex items-center space-x-2">
                  {streamStatus ? (
                    <>
                      {streamStatus.is_live ? (
                        <>
                          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                          <span className="text-red-600 font-medium">配信中</span>
                          {streamStatus.viewer_count > 0 && (
                            <span className="text-gray-500 dark:text-gray-400">
                              (視聴者: {streamStatus.viewer_count}人)
                            </span>
                          )}
                          {streamStatus.duration_seconds && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {Math.floor(streamStatus.duration_seconds / 3600)}時間
                              {Math.floor((streamStatus.duration_seconds % 3600) / 60)}分
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 rounded-full bg-gray-400" />
                          <span className="text-gray-500 dark:text-gray-400">オフライン</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">配信状態を取得中...</span>
                  )}
                  <Button
                    onClick={onRefreshStreamStatus}
                    disabled={refreshingStreamStatus}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2"
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshingStreamStatus ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            )}

            {/* Twitch認証警告 */}
            {featureStatus.twitch_configured && authStatus && !authStatus.authenticated && (
              <div className="ml-5 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-orange-600">
                    ⚠️ Twitch認証が必要です
                  </span>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={onTwitchAuth}
                    className="h-6 px-2 text-xs"
                  >
                    Twitchで認証
                  </Button>
                </div>
              </div>
            )}

            {/* 認証済みの場合はユーザー情報を表示 */}
            {featureStatus.twitch_configured && authStatus?.authenticated && (
              <div className="ml-5 text-sm">
                {/* ユーザー情報（検証済みの場合） */}
                {twitchUserInfo?.verified && (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-600 dark:text-gray-300">
                      ユーザー: {twitchUserInfo.login} ({twitchUserInfo.display_name})
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onVerifyTwitchConfig}
                      disabled={verifyingTwitch}
                      className="h-6 px-2 text-xs"
                    >
                      {verifyingTwitch ? '検証中...' : '検証'}
                    </Button>
                  </div>
                )}

                {/* エラー表示 */}
                {twitchUserInfo && !twitchUserInfo.verified && (
                  <div className="flex items-center space-x-2">
                    <span className="text-red-600">
                      ⚠️ {twitchUserInfo.error || '設定エラー'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onVerifyTwitchConfig}
                      disabled={verifyingTwitch}
                      className="h-6 px-2 text-xs"
                    >
                      {verifyingTwitch ? '検証中...' : '再検証'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 検証中表示 */}
            {featureStatus.twitch_configured && authStatus?.authenticated && !twitchUserInfo && verifyingTwitch && (
              <div className="ml-5 text-sm text-gray-500 dark:text-gray-400">
                検証中...
              </div>
            )}
          </div>

          {/* プリンター状態 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                !featureStatus.printer_configured ? 'bg-red-500' :
                printerStatusInfo?.connected ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              <span className="font-medium dark:text-gray-200">プリンター</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {featureStatus.printer_configured ? '設定済み' : '未設定'}
              </span>
            </div>
            {featureStatus.printer_configured && (
              <div className="ml-5 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600 dark:text-gray-300">
                    接続状態: {printerStatusInfo?.connected ? '接続中' : '未接続'}
                    {printerStatusInfo?.dry_run_mode && ' (DRY-RUN)'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onPrinterReconnect}
                    disabled={reconnectingPrinter}
                    className="h-6 px-2 text-xs"
                  >
                    {reconnectingPrinter ? '再接続中...' : '再接続'}
                  </Button>
                  {featureStatus.printer_configured && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onTestPrint}
                      disabled={testingPrinter}
                      className="h-6 px-2 text-xs"
                    >
                      {testingPrinter ? 'テスト中...' : 'テスト'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Webサーバー状態 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="font-medium dark:text-gray-200">Webサーバー</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ポート {resolvedWebServerPort ?? '-'}
              </span>
            </div>
          </div>

          {/* 警告 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${featureStatus.warnings && featureStatus.warnings.length > 0 ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className="font-medium dark:text-gray-200">警告</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {featureStatus.warnings && featureStatus.warnings.length > 0
                  ? `${featureStatus.warnings.length}件`
                  : 'なし'}
              </span>
            </div>
            {/* 警告の詳細表示 */}
            {featureStatus.warnings && featureStatus.warnings.length > 0 && (
              <div className="ml-5 text-sm mt-1">
                {featureStatus.warnings.map((warning: string, index: number) => (
                  <div key={index} className="text-yellow-600 dark:text-yellow-400">
                    ⚠️ {warning}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
