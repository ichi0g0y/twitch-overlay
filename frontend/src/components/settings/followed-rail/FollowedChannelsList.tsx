import React from 'react';

import { FollowedChannelPopover } from '../FollowedChannelPopover';
import type { FollowedChannelRailItem } from './types';

interface FollowedChannelsListProps {
  side: 'left' | 'right';
  channels: FollowedChannelRailItem[];
  loading: boolean;
  openChannelId: string | null;
  menuAnchor: { top: number; left: number; width: number } | null;
  hoveredChannelId: string | null;
  hoverAnchor: { top: number; left: number } | null;
  ircConnectedChannels: string[];
  copiedChannelId: string | null;
  raidConfirmChannelId: string | null;
  raidingChannelId: string | null;
  shoutoutingChannelId: string | null;
  actionError: string;
  canStartRaid: boolean;
  resolveFollowerCountLabel: (channel: FollowedChannelRailItem) => string;
  ensureFollowerCount: (channel: FollowedChannelRailItem) => Promise<void>;
  formatViewerCount: (count: number) => string;
  onSelectChannel: (channel: FollowedChannelRailItem, rect: DOMRect) => void;
  onCloseChannel: () => void;
  onHoverChannel: (channelId: string, anchor: { top: number; left: number }) => void;
  onClearHover: (channelId: string) => void;
  onCopyChannelLogin: (channel: FollowedChannelRailItem) => Promise<void>;
  onConnect: (channel: FollowedChannelRailItem) => void;
  onStartShoutout: (channel: FollowedChannelRailItem) => Promise<void>;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
  onCancelRaidConfirm: () => void;
}

export const FollowedChannelsList: React.FC<FollowedChannelsListProps> = ({
  side,
  channels,
  loading,
  openChannelId,
  menuAnchor,
  hoveredChannelId,
  hoverAnchor,
  ircConnectedChannels,
  copiedChannelId,
  raidConfirmChannelId,
  raidingChannelId,
  shoutoutingChannelId,
  actionError,
  canStartRaid,
  resolveFollowerCountLabel,
  ensureFollowerCount,
  formatViewerCount,
  onSelectChannel,
  onCloseChannel,
  onHoverChannel,
  onClearHover,
  onCopyChannelLogin,
  onConnect,
  onStartShoutout,
  onStartRaid,
  onCancelRaidConfirm,
}) => {
  const hoveredChannel = hoveredChannelId
    ? (channels.find((item) => item.broadcaster_id === hoveredChannelId) ?? null)
    : null;

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-2 px-1 py-1">
        {loading && (
          <div className="flex w-full justify-center py-1 text-[10px] text-gray-400">
            ...
          </div>
        )}
        {!loading && channels.length === 0 && (
          <div className="flex w-full justify-center py-1 text-[10px] text-gray-500">
            --
          </div>
        )}

        {channels.map((channel) => {
          const selected = openChannelId === channel.broadcaster_id;
          const channelDisplayName = channel.broadcaster_name || channel.broadcaster_login;
          const channelLogin = channel.broadcaster_login;
          const followerCountLabel = resolveFollowerCountLabel(channel);
          const normalizedChannelLogin = channelLogin.trim().toLowerCase();
          const alreadyConnected = ircConnectedChannels.includes(normalizedChannelLogin);

          return (
            <div
              key={channel.broadcaster_id}
              className="group relative flex justify-center"
            >
              <button
                type="button"
                onClick={(event) => {
                  const nextOpen = openChannelId !== channel.broadcaster_id;
                  if (!nextOpen) {
                    onCloseChannel();
                    return;
                  }

                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  onSelectChannel(channel, rect);
                  void ensureFollowerCount(channel);
                }}
                className={`relative h-9 w-9 rounded-full border transition ${
                  selected
                    ? 'border-blue-400 ring-1 ring-blue-400/60'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
                onMouseEnter={(event) => {
                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  onHoverChannel(channel.broadcaster_id, {
                    top: rect.top + rect.height / 2,
                    left: side === 'left' ? rect.right + 8 : rect.left - 8,
                  });
                  void ensureFollowerCount(channel);
                }}
                onMouseMove={(event) => {
                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  onHoverChannel(channel.broadcaster_id, {
                    top: rect.top + rect.height / 2,
                    left: side === 'left' ? rect.right + 8 : rect.left - 8,
                  });
                }}
                onMouseLeave={() => {
                  onClearHover(channel.broadcaster_id);
                }}
                aria-label={`${channelDisplayName} の操作を開く`}
                data-followed-trigger="true"
              >
                <span className="block h-full w-full overflow-hidden rounded-full">
                  {channel.profile_image_url ? (
                    <img
                      src={channel.profile_image_url}
                      alt={channelDisplayName}
                      className={`h-full w-full object-cover ${channel.is_live ? '' : 'grayscale opacity-70'}`}
                    />
                  ) : (
                    <span
                      className={`flex h-full w-full items-center justify-center bg-gray-700 text-xs font-semibold ${
                        channel.is_live ? 'text-white' : 'text-gray-300'
                      }`}
                    >
                      {(channelDisplayName || '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                {channel.is_live && (
                  <span className="absolute -bottom-1 left-1/2 z-10 min-w-[16px] -translate-x-1/2 rounded-full border border-gray-900 bg-red-600 px-[2px] py-[2px] text-center text-[8px] font-bold leading-none text-white shadow">
                    {formatViewerCount(channel.viewer_count)}
                  </span>
                )}
              </button>

              {selected && menuAnchor && (
                <FollowedChannelPopover
                  channel={channel}
                  followerCountLabel={followerCountLabel}
                  alreadyConnected={alreadyConnected}
                  canStartRaid={canStartRaid}
                  copiedChannelId={copiedChannelId}
                  raidConfirmChannelId={raidConfirmChannelId}
                  raidingChannelId={raidingChannelId}
                  shoutoutingChannelId={shoutoutingChannelId}
                  actionError={actionError}
                  style={{
                    left: `${menuAnchor.left}px`,
                    top: `${menuAnchor.top}px`,
                    width: `${menuAnchor.width}px`,
                  }}
                  onCopyChannelLogin={onCopyChannelLogin}
                  onConnect={onConnect}
                  onStartShoutout={onStartShoutout}
                  onStartRaid={onStartRaid}
                  onCancelRaidConfirm={onCancelRaidConfirm}
                />
              )}
            </div>
          );
        })}
      </div>

      {hoveredChannel && hoverAnchor && (
        <div
          className={`pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-100 shadow ${
            side === 'left' ? '' : '-translate-x-full'
          }`}
          style={{
            top: `${hoverAnchor.top}px`,
            left: `${hoverAnchor.left}px`,
          }}
        >
          <div className="font-semibold leading-tight">
            {hoveredChannel.broadcaster_name || hoveredChannel.broadcaster_login}
          </div>
          <div className="text-[10px] leading-tight text-gray-300">
            #{hoveredChannel.broadcaster_login}
          </div>
          <div className="text-[10px] leading-tight text-gray-300">{`フォロワー: ${resolveFollowerCountLabel(hoveredChannel)}`}</div>
          {hoveredChannel.is_live && hoveredChannel.title && (
            <div className="mt-1 text-[10px] leading-tight text-gray-200">
              {hoveredChannel.title}
            </div>
          )}
          {hoveredChannel.is_live && hoveredChannel.game_name && (
            <div className="text-[10px] leading-tight text-gray-300">
              {hoveredChannel.game_name}
            </div>
          )}
        </div>
      )}
    </>
  );
};
