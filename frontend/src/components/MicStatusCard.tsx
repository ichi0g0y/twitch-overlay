import React from 'react';
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Languages, Mic } from "lucide-react";
import { useMicCaptionStatus } from '@/contexts/MicCaptionStatusContext';
import { getBrowserInfo, getChromeMajorVersion, MIN_CHROME_VERSION } from '@/utils/browserInfo';
import type { OverlaySettings } from '@/contexts/SettingsContext';
import { MicCaptionSender } from '@/components/mic/MicCaptionSender';

export const MicStatusCard: React.FC<{
  overlaySettings: OverlaySettings | null;
  updateOverlaySettings: (updates: Partial<OverlaySettings>) => Promise<void>;
  webServerPort?: number;
}> = ({ overlaySettings, updateOverlaySettings, webServerPort }) => {
  const { status: micStatus } = useMicCaptionStatus();
  const browserInfo = React.useMemo(() => getBrowserInfo(), []);
  const chromeMajor = React.useMemo(() => getChromeMajorVersion(browserInfo), [browserInfo]);

  return (
    <CollapsibleCard
      panelId="settings.mic-status"
      className="mb-6"
      title={(
        <span className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-gray-400" />
          マイク
        </span>
      )}
      headerClassName="text-left"
      contentClassName="text-left"
    >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${micStatus.capturing ? 'bg-green-500' : micStatus.speechSupported ? 'bg-yellow-500' : 'bg-gray-500'}`} />
          <div className="text-sm font-medium dark:text-gray-200">
            {micStatus.capturing ? '送信中' : '停止'}
          </div>
          <div className="ml-auto">
            <MicCaptionSender
              variant="switch_only"
              overlaySettings={overlaySettings ?? null}
              webServerPort={webServerPort}
              onEnabledChange={(enabled) => updateOverlaySettings({ mic_transcript_speech_enabled: enabled })}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="space-y-2 text-sm">
            <div className="text-gray-600 dark:text-gray-300">
              WS: {micStatus.wsConnected ? '接続中' : '未接続'}
              <span className="mx-1">/</span>
              音声認識: {!micStatus.speechSupported ? '非対応' : micStatus.recState === 'running' ? '実行中' : micStatus.recState === 'starting' ? '起動中' : '停止'}
              <span className="ml-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                lang={micStatus.speechLang} {micStatus.dualInstanceEnabled ? 'dual' : 'single'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Languages className="w-4 h-4 text-gray-400" />
              <span>
                翻訳: <span className="font-mono">{micStatus.translationEnabled ? `on (${micStatus.translationTargets.join(', ') || '-'})` : 'off'}</span>
              </span>
              {micStatus.translationEnabled && !micStatus.translatorSupported ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Translator API非対応（必要: Chrome {MIN_CHROME_VERSION.translatorApi}+ / 現在: {browserInfo.name}{browserInfo.version ? ` ${browserInfo.version}` : ''}）
                </span>
              ) : null}
            </div>

            {micStatus.downloadStatus ? (
              <div className="text-xs text-gray-600 dark:text-gray-300">
                <div>
                  {micStatus.downloadStatus.message || `download: ${micStatus.downloadStatus.status} (${micStatus.downloadStatus.sourceLang}→${micStatus.downloadStatus.targetLang})`}
                </div>
                {typeof micStatus.downloadStatus.progress === 'number' ? (
                  <div className="mt-1 h-2 rounded bg-gray-200/70 dark:bg-gray-700/70 overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${Math.min(100, Math.max(0, micStatus.downloadStatus.progress))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {micStatus.error ? (
              <div className="text-xs text-red-600 dark:text-red-200">
                ⚠️ {micStatus.error}
              </div>
            ) : null}

            <div className="text-xs text-gray-500 dark:text-gray-400">
              {browserInfo.name}{browserInfo.version ? ` ${browserInfo.version}` : ''}
              <span className="mx-2">|</span>
              目安: 音声認識 Chrome {MIN_CHROME_VERSION.speechRecognition}+ / 翻訳 Chrome {MIN_CHROME_VERSION.translatorApi}+
              {chromeMajor !== null ? (
                <span className="ml-2 font-mono">
                  (Chrome major: {chromeMajor})
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">認識文字</div>
            <div className="rounded border border-gray-200/70 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">認識中</div>
              <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words min-h-[2.5rem]">
                {micStatus.lastInterimText || '...'}
              </div>

              <div className="pt-2 border-t border-gray-200/70 dark:border-gray-800" />

              <div className="text-xs text-gray-500 dark:text-gray-400">確定</div>
              <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words min-h-[2.5rem]">
                {micStatus.lastFinalText || '...'}
              </div>
            </div>
          </div>
        </div>
    </CollapsibleCard>
  );
};
