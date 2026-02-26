import React from 'react';
import { Switch } from '../../ui/switch';
import type { StatusTopBarProps } from './types';

type MicStatusPanelProps = Pick<
  StatusTopBarProps,
  'overlaySettings' | 'updateOverlaySettings'
> & {
  micStatus: {
    wsConnected: boolean;
    translationEnabled: boolean;
    translationTargets: string[];
  };
  interim: string;
  finalText: string;
  translatedText: string;
};

export const MicStatusPanel: React.FC<MicStatusPanelProps> = ({
  overlaySettings,
  updateOverlaySettings,
  micStatus,
  interim,
  finalText,
  translatedText,
}) => {
  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-[360px] rounded-md border border-gray-700 bg-gray-900/95 p-2 text-xs text-gray-100 shadow-xl">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">マイク詳細</span>
        <div className="inline-flex items-center gap-2">
          <span className="text-[11px] text-gray-400">
            WS: {micStatus.wsConnected ? '接続中' : '未接続'}
          </span>
          <Switch
            aria-label="マイク"
            checked={overlaySettings?.mic_transcript_speech_enabled ?? false}
            onCheckedChange={(enabled) => {
              void updateOverlaySettings({
                mic_transcript_speech_enabled: enabled,
              });
            }}
          />
        </div>
      </div>
      <div className="mb-1 text-[11px] text-gray-300">
        翻訳: {micStatus.translationEnabled ? `on (${micStatus.translationTargets.join(', ') || '-'})` : 'off'}
      </div>
      <div className="rounded border border-gray-700 bg-black/20 p-2">
        <div className="text-[11px] text-gray-400">認識中</div>
        <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
          {interim || '...'}
        </div>
      </div>
      <div className="mt-1 rounded border border-gray-700 bg-black/20 p-2">
        <div className="text-[11px] text-gray-400">確定</div>
        <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
          {finalText || '...'}
        </div>
      </div>
      <div className="mt-1 rounded border border-gray-700 bg-black/20 p-2">
        <div className="text-[11px] text-gray-400">翻訳</div>
        <div className="min-h-6 whitespace-pre-wrap break-words text-[12px] text-gray-100">
          {translatedText || '...'}
        </div>
      </div>
    </div>
  );
};
