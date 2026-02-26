import React, { useEffect } from 'react';
import { TwitchPlayerEmbed } from '../../settings/TwitchPlayerEmbed';

type TwitchStreamPreviewProps = {
  isTwitchConfigured: boolean;
  isAuthenticated: boolean;
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (warningMessage: string | null) => void;
};

type CompactPreviewFrameProps = {
  children: React.ReactNode;
};

const CompactPreviewFrame: React.FC<CompactPreviewFrameProps> = ({ children }) => {
  return (
    <div className="h-full min-h-0 overflow-hidden bg-gray-900/20">
      <div className="min-h-0 h-full">{children}</div>
    </div>
  );
};

type PreviewEmbedProps = {
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (warningMessage: string | null) => void;
};

const PreviewEmbed: React.FC<PreviewEmbedProps> = ({
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  return (
    <div className="nodrag nopan h-full min-h-0 overflow-hidden bg-black">
      <TwitchPlayerEmbed
        channelLogin={channelLogin}
        reloadNonce={reloadNonce}
        autoplayEnabled={autoplayEnabled}
        interactionDisabled={interactionDisabled}
        onWarningChange={onWarningChange}
      />
    </div>
  );
};

export const TwitchStreamPreview: React.FC<TwitchStreamPreviewProps> = ({
  isTwitchConfigured,
  isAuthenticated,
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  const canEmbed = Boolean(channelLogin);

  useEffect(() => {
    if (isTwitchConfigured && isAuthenticated && canEmbed) return;
    onWarningChange(null);
  }, [canEmbed, isAuthenticated, isTwitchConfigured, onWarningChange]);

  return (
    <CompactPreviewFrame>
      {!isTwitchConfigured && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">Twitch設定が未完了です。</p>
        </div>
      )}
      {isTwitchConfigured && !isAuthenticated && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">
            Twitch認証後にプレビューを表示します。
          </p>
        </div>
      )}
      {isTwitchConfigured && isAuthenticated && !canEmbed && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-sm text-gray-400">
            ユーザー情報を検証中です。少し待つか、Twitch設定で再検証してください。
          </p>
        </div>
      )}
      {isTwitchConfigured && isAuthenticated && canEmbed && (
        <PreviewEmbed
          channelLogin={channelLogin}
          reloadNonce={reloadNonce}
          autoplayEnabled={autoplayEnabled}
          interactionDisabled={interactionDisabled}
          onWarningChange={onWarningChange}
        />
      )}
    </CompactPreviewFrame>
  );
};

type AddedChannelStreamPreviewProps = {
  kind: any;
  channelLogin: string;
  reloadNonce: number;
  autoplayEnabled: boolean;
  interactionDisabled: boolean;
  onWarningChange: (kind: any, warningMessage: string | null) => void;
};

export const AddedChannelStreamPreview: React.FC<AddedChannelStreamPreviewProps> = ({
  kind,
  channelLogin,
  reloadNonce,
  autoplayEnabled,
  interactionDisabled,
  onWarningChange,
}) => {
  return (
    <CompactPreviewFrame>
      <PreviewEmbed
        channelLogin={channelLogin}
        reloadNonce={reloadNonce}
        autoplayEnabled={autoplayEnabled}
        interactionDisabled={interactionDisabled}
        onWarningChange={(warningMessage) => onWarningChange(kind, warningMessage)}
      />
    </CompactPreviewFrame>
  );
};
