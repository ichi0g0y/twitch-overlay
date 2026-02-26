import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { StatusTopBarProps } from './types';

type SystemStatusPanelProps = Pick<
  StatusTopBarProps,
  | 'featureStatus'
  | 'authStatus'
  | 'streamStatus'
  | 'twitchUserInfo'
  | 'printerStatusInfo'
  | 'refreshingStreamStatus'
  | 'reconnectingPrinter'
  | 'testingPrinter'
  | 'verifyingTwitch'
  | 'onTwitchAuth'
  | 'onRefreshStreamStatus'
  | 'onVerifyTwitchConfig'
  | 'onPrinterReconnect'
  | 'onTestPrint'
> & {
  resolvedWebServerPort?: number;
};

export const SystemStatusPanel: React.FC<SystemStatusPanelProps> = ({
  featureStatus,
  authStatus,
  streamStatus,
  twitchUserInfo,
  printerStatusInfo,
  refreshingStreamStatus,
  reconnectingPrinter,
  testingPrinter,
  verifyingTwitch,
  onTwitchAuth,
  onRefreshStreamStatus,
  onVerifyTwitchConfig,
  onPrinterReconnect,
  onTestPrint,
  resolvedWebServerPort,
}) => {
  const warningCount = featureStatus?.warnings?.length ?? 0;
  return (
    <div className="absolute left-0 top-full z-40 mt-2 w-[440px] rounded-md border border-gray-700 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">システム状態</span>
        <span className="text-[11px] text-gray-400">Web: {resolvedWebServerPort ?? '-'}</span>
      </div>
      <div className="space-y-2">
        <div className="rounded border border-gray-700 bg-black/20 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">Twitch</span>
            <span className={`text-[11px] ${featureStatus?.twitch_configured ? 'text-emerald-300' : 'text-red-300'}`}>
              {featureStatus?.twitch_configured ? '設定済み' : '未設定'}
            </span>
          </div>
          {featureStatus?.twitch_configured && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-300">
                  配信: {streamStatus?.is_live ? `LIVE (${streamStatus.viewer_count ?? 0})` : 'OFFLINE'}
                </span>
                <button
                  type="button"
                  onClick={onRefreshStreamStatus}
                  disabled={refreshingStreamStatus}
                  className="inline-flex h-6 items-center gap-1 rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingStreamStatus ? 'animate-spin' : ''}`} />
                  更新
                </button>
              </div>
              {!authStatus?.authenticated && (
                <button
                  type="button"
                  onClick={onTwitchAuth}
                  className="inline-flex h-6 items-center rounded border border-amber-600/70 px-2 text-[11px] text-amber-200 hover:bg-amber-700/20"
                >
                  Twitchで認証
                </button>
              )}
              {authStatus?.authenticated && (
                <div className="flex items-center justify-between">
                  <span className="truncate text-[11px] text-gray-300">
                    {twitchUserInfo?.verified
                      ? `${twitchUserInfo.login} (${twitchUserInfo.display_name})`
                      : twitchUserInfo?.error || '検証未完了'}
                  </span>
                  <button
                    type="button"
                    onClick={onVerifyTwitchConfig}
                    disabled={verifyingTwitch}
                    className="ml-2 inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                  >
                    {verifyingTwitch ? '検証中...' : '検証'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded border border-gray-700 bg-black/20 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">プリンター</span>
            <span className={`text-[11px] ${featureStatus?.printer_configured ? (printerStatusInfo?.connected ? 'text-emerald-300' : 'text-amber-300') : 'text-red-300'}`}>
              {featureStatus?.printer_configured
                ? printerStatusInfo?.connected
                  ? '接続中'
                  : '未接続'
                : '未設定'}
            </span>
          </div>
          {featureStatus?.printer_configured && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrinterReconnect}
                disabled={reconnectingPrinter}
                className="inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
              >
                {reconnectingPrinter ? '再接続中...' : '再接続'}
              </button>
              <button
                type="button"
                onClick={onTestPrint}
                disabled={testingPrinter}
                className="inline-flex h-6 items-center rounded border border-gray-600 px-2 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-60"
              >
                {testingPrinter ? 'テスト中...' : 'テスト'}
              </button>
            </div>
          )}
        </div>

        {warningCount > 0 && (
          <div className="rounded border border-amber-700/60 bg-amber-900/20 p-2">
            <div className="mb-1 font-medium text-amber-200">警告</div>
            <div className="space-y-1">
              {(featureStatus?.warnings ?? []).map((warning: string, index: number) => (
                <div key={`${warning}-${index}`} className="text-[11px] text-amber-100">
                  {warning}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
