import React from 'react';
import {
  AlertTriangle,
  Languages,
  Mic,
  Plus,
  Radio,
  Server,
  Wifi,
} from 'lucide-react';
import { CardMenuPanel } from './CardMenuPanel';
import { MicStatusPanel } from './MicStatusPanel';
import { SystemStatusPanel } from './SystemStatusPanel';
import type { StatusTopBarProps } from './types';
import { useStatusTopBarState } from './useStatusTopBarState';

export const StatusTopBar: React.FC<StatusTopBarProps> = ({
  leftOffset,
  rightOffset,
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
  overlaySettings,
  updateOverlaySettings,
  cardMenuItems,
  onAddCard,
  onAddIrcPreview,
  canAddCard,
  ircChannelDisplayNames,
}) => {
  const {
    micStatus,
    openPanel,
    setOpenPanel,
    cardMenuOpen,
    setCardMenuOpen,
    setCardMenuHoveredCategory,
    ircConnectedChannels,
    systemTriggerRef,
    micTriggerRef,
    cardMenuTriggerRef,
    systemPanelRef,
    micPanelRef,
    cardMenuPanelRef,
    interim,
    finalText,
    translatedText,
    resolvedWebServerPort,
    cardMenuItemsByCategory,
    activeCardMenuGroup,
    normalizeCardMenuItemLabel,
    micStateLabel,
  } = useStatusTopBarState({
    webServerPort,
    cardMenuItems,
  });
  const warningCount = featureStatus?.warnings?.length ?? 0;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[1700] h-[54px] border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm xl:left-[var(--settings-topbar-left)] xl:right-[var(--settings-topbar-right)]"
      style={
        {
          '--settings-topbar-left': `${leftOffset}px`,
          '--settings-topbar-right': `${rightOffset}px`,
        } as React.CSSProperties
      }
    >
      <div className="flex h-full items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              ref={systemTriggerRef}
              type="button"
              onClick={() =>
                setOpenPanel((prev) => (prev === 'system' ? null : 'system'))
              }
              className="inline-flex h-7 items-center gap-2.5 rounded-md border border-gray-700 bg-gray-900/70 px-2.5 hover:bg-gray-800"
              aria-expanded={openPanel === 'system'}
              aria-label="システム状態を表示"
            >
              <span
                className="inline-flex items-center gap-1 text-xs text-gray-300"
                title={
                  featureStatus?.twitch_configured
                    ? authStatus?.authenticated
                      ? 'Twitch認証済み'
                      : 'Twitch認証待ち'
                    : 'Twitch未設定'
                }
              >
                <Wifi className={`h-4 w-4 ${!featureStatus?.twitch_configured ? 'text-red-400' : authStatus?.authenticated ? 'text-emerald-400' : 'text-amber-400'}`} />
                Twitch
              </span>
              <span
                className="inline-flex items-center gap-1 text-xs text-gray-300"
                title={streamStatus?.is_live ? `配信中 (${streamStatus.viewer_count ?? 0})` : 'オフライン'}
              >
                <Radio className={`h-4 w-4 ${streamStatus?.is_live ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
                Live
              </span>
              <span
                className="inline-flex items-center gap-1 text-xs text-gray-300"
                title={
                  !featureStatus?.printer_configured
                    ? 'プリンター未設定'
                    : printerStatusInfo?.connected
                      ? 'プリンター接続中'
                      : 'プリンター未接続'
                }
              >
                <Server className={`h-4 w-4 ${!featureStatus?.printer_configured ? 'text-red-400' : printerStatusInfo?.connected ? 'text-emerald-400' : 'text-amber-400'}`} />
                Printer
              </span>
              <span
                className="inline-flex items-center gap-1 text-xs text-gray-300"
                title={warningCount > 0 ? `${warningCount}件の警告` : '警告なし'}
              >
                <AlertTriangle className={`h-4 w-4 ${warningCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
                Warn
              </span>
            </button>
            {openPanel === 'system' && (
              <div ref={systemPanelRef}>
                <SystemStatusPanel
                  featureStatus={featureStatus}
                  authStatus={authStatus}
                  streamStatus={streamStatus}
                  twitchUserInfo={twitchUserInfo}
                  printerStatusInfo={printerStatusInfo}
                  refreshingStreamStatus={refreshingStreamStatus}
                  reconnectingPrinter={reconnectingPrinter}
                  testingPrinter={testingPrinter}
                  verifyingTwitch={verifyingTwitch}
                  onTwitchAuth={onTwitchAuth}
                  onRefreshStreamStatus={onRefreshStreamStatus}
                  onVerifyTwitchConfig={onVerifyTwitchConfig}
                  onPrinterReconnect={onPrinterReconnect}
                  onTestPrint={onTestPrint}
                  resolvedWebServerPort={resolvedWebServerPort}
                />
              </div>
            )}
          </div>

          <div className="relative flex items-center gap-2">
            <button
              ref={micTriggerRef}
              type="button"
              onClick={() => setOpenPanel((prev) => (prev === 'mic' ? null : 'mic'))}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/70 px-2.5 hover:bg-gray-800"
              aria-expanded={openPanel === 'mic'}
              aria-label="マイク状態を表示"
            >
              <Mic className={`h-4 w-4 ${micStatus.capturing ? 'text-emerald-400' : micStatus.speechSupported ? 'text-amber-400' : 'text-gray-500'}`} />
              <span className="text-xs text-gray-200">{micStateLabel}</span>
              <Languages className={`h-4 w-4 ${micStatus.translationEnabled ? 'text-sky-400' : 'text-gray-500'}`} />
              <span className="text-[11px] text-gray-300">
                {micStatus.translationEnabled
                  ? micStatus.translationTargets.join(', ') || '-'
                  : 'off'}
              </span>
            </button>

            {openPanel === 'mic' && (
              <div ref={micPanelRef}>
                <MicStatusPanel
                  overlaySettings={overlaySettings}
                  updateOverlaySettings={updateOverlaySettings}
                  micStatus={micStatus}
                  interim={interim}
                  finalText={finalText}
                  translatedText={translatedText}
                />
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <button
            ref={cardMenuTriggerRef}
            type="button"
            onClick={() => setCardMenuOpen((prev) => !prev)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 bg-gray-900/70 text-gray-200 hover:bg-gray-800"
            aria-expanded={cardMenuOpen}
            aria-label="設定カードを追加"
          >
            <Plus className="h-4 w-4" />
          </button>
          {cardMenuOpen && (
            <div ref={cardMenuPanelRef}>
              <CardMenuPanel
                cardMenuItemsByCategory={cardMenuItemsByCategory}
                activeCardMenuGroup={activeCardMenuGroup}
                canAddCard={canAddCard}
                onAddCard={onAddCard}
                normalizeCardMenuItemLabel={normalizeCardMenuItemLabel}
                setCardMenuOpen={setCardMenuOpen}
                setCardMenuHoveredCategory={setCardMenuHoveredCategory}
                ircConnectedChannels={ircConnectedChannels}
                ircChannelDisplayNames={ircChannelDisplayNames}
                onAddIrcPreview={onAddIrcPreview}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
