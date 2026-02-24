import { Check, Copy, ExternalLink } from 'lucide-react';
import React from 'react';
import type { FollowedChannelRailItem } from '../SettingsPage';
import { TwitchPreviewIframe } from './TwitchPreviewIframe';

type FollowedChannelPopoverProps = {
  channel: FollowedChannelRailItem;
  followerCountLabel: string;
  alreadyConnected: boolean;
  canStartRaid: boolean;
  copiedChannelId: string | null;
  raidConfirmChannelId: string | null;
  raidingChannelId: string | null;
  shoutoutingChannelId: string | null;
  actionError: string;
  style: React.CSSProperties;
  onCopyChannelLogin: (channel: FollowedChannelRailItem) => Promise<void>;
  onConnect: (channel: FollowedChannelRailItem) => void;
  onStartShoutout: (channel: FollowedChannelRailItem) => Promise<void>;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
  onCancelRaidConfirm: () => void;
};

export const FollowedChannelPopover: React.FC<FollowedChannelPopoverProps> = ({
  channel,
  followerCountLabel,
  alreadyConnected,
  canStartRaid,
  copiedChannelId,
  raidConfirmChannelId,
  raidingChannelId,
  shoutoutingChannelId,
  actionError,
  style,
  onCopyChannelLogin,
  onConnect,
  onStartShoutout,
  onStartRaid,
  onCancelRaidConfirm,
}) => {
  const channelDisplayName = channel.broadcaster_name || channel.broadcaster_login;
  const channelLogin = channel.broadcaster_login;
  const canStartShoutout = canStartRaid && channel.is_live;

  return (
    <div
      data-followed-menu="true"
      className="fixed z-50 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl"
      style={style}
    >
      {channel.is_live && <TwitchPreviewIframe channelLogin={channelLogin} />}
      <div className="text-xs font-semibold text-gray-100">{channelDisplayName}</div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] text-gray-400">#{channelLogin}</div>
        <div className="inline-flex items-center gap-1">
          <a
            href={`https://www.twitch.tv/${encodeURIComponent(channelLogin)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            aria-label={`${channelLogin} のチャンネルを開く`}
            title="チャンネルを開く"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => { void onCopyChannelLogin(channel); }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            aria-label={`${channelLogin} をコピー`}
            title="チャンネル名をコピー"
          >
            {copiedChannelId === channel.broadcaster_id ? (
              <Check className="h-3 w-3 text-emerald-300" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
      <div className="mb-1 text-[11px] text-gray-300">{`フォロワー: ${followerCountLabel}`}</div>
      <div className="mb-2 text-[11px] text-gray-400 truncate">
        {channel.title || (channel.is_live ? 'LIVE中' : 'オフライン')}
      </div>
      <button
        type="button"
        disabled={alreadyConnected}
        onClick={() => onConnect(channel)}
        className={`mb-1 inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
          alreadyConnected
            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
            : 'border-emerald-600/60 text-emerald-300 hover:bg-emerald-700/20'
        }`}
      >
        {alreadyConnected ? '接続済み' : '接続'}
      </button>
      <button
        type="button"
        disabled={!canStartShoutout || shoutoutingChannelId === channel.broadcaster_id}
        onClick={() => { void onStartShoutout(channel); }}
        className={`mb-1 inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
          !canStartShoutout
            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
            : 'border-fuchsia-600/60 text-fuchsia-200 hover:bg-fuchsia-700/20'
        } disabled:opacity-60`}
      >
        {shoutoutingChannelId === channel.broadcaster_id ? '応援中...' : '応援'}
      </button>
      <button
        type="button"
        disabled={!canStartRaid || raidingChannelId === channel.broadcaster_id}
        onClick={() => { void onStartRaid(channel); }}
        className={`inline-flex h-8 w-full items-center justify-center rounded border text-xs ${
          !canStartRaid
            ? 'border-gray-700 text-gray-500 cursor-not-allowed'
            : raidConfirmChannelId === channel.broadcaster_id
            ? 'border-red-500/80 text-red-200 hover:bg-red-700/20'
            : 'border-gray-600 text-gray-200 hover:bg-gray-800'
        } disabled:opacity-60`}
      >
        {raidingChannelId === channel.broadcaster_id
          ? 'レイド中...'
          : raidConfirmChannelId === channel.broadcaster_id
            ? 'レイド確定'
            : 'レイド'}
      </button>
      {raidConfirmChannelId === channel.broadcaster_id && (
        <button
          type="button"
          onClick={onCancelRaidConfirm}
          className="mt-1 inline-flex h-7 w-full items-center justify-center rounded border border-gray-700 text-[11px] text-gray-300 hover:bg-gray-800"
        >
          キャンセル
        </button>
      )}
      {actionError && <p className="mt-1 text-[11px] text-red-300">{actionError}</p>}
    </div>
  );
};
