import React from 'react';
import { useMicCaptionStatus } from '../../contexts/MicCaptionStatusContext';
import { Switch } from '../ui/switch';
import { useMicCaptionConfig } from './mic-caption/config';
import { useMicCaptionController } from './mic-caption/useMicCaptionController';
import type { MicCaptionSenderProps } from './mic-caption/types';

export const MicCaptionSender: React.FC<MicCaptionSenderProps> = ({
  overlaySettings,
  webServerPort,
  onEnabledChange,
  variant = 'full',
}) => {
  const { updateStatus } = useMicCaptionStatus();
  const config = useMicCaptionConfig(overlaySettings);
  const {
    capturing,
    recState,
    speechSupported,
    startCapture,
    stopCapture,
  } = useMicCaptionController({ config, updateStatus });

  const handleCheckedChange = (checked: boolean) => {
    onEnabledChange?.(checked);
    if (checked) {
      if (recState === 'stopped' && !capturing) void startCapture();
    } else {
      stopCapture();
    }
  };

  if (variant === 'switch_only') {
    return (
      <Switch
        aria-label="マイク"
        checked={config.enabledSetting}
        disabled={!speechSupported && !config.enabledSetting}
        onCheckedChange={handleCheckedChange}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">マイク</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {capturing ? '送信中' : (config.enabledSetting ? '起動待ち' : '停止中')}
          </div>
        </div>
        <Switch
          checked={config.enabledSetting}
          disabled={!speechSupported && !config.enabledSetting}
          onCheckedChange={handleCheckedChange}
        />
      </div>

      {!capturing && !speechSupported ? (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          この環境では SpeechRecognition が見つからないだす。Chromeで{' '}
          <span className="font-mono">http://localhost:{webServerPort || 'PORT'}/</span> を開いて操作してくださいだす。
        </div>
      ) : null}
    </div>
  );
};
