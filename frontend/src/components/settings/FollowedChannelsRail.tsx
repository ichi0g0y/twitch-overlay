import React, { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_IRC_CHANNELS, readIrcChannels, subscribeIrcChannels } from '../../utils/chatChannels';
import { FollowedChannelsList } from './followed-rail/FollowedChannelsList';
import { FollowedRailQuickMenu } from './followed-rail/FollowedRailQuickMenu';
import type { FollowedChannelRailItem, FollowedChannelsRailProps } from './followed-rail/types';
import { useFollowerCountCache } from './followed-rail/useFollowerCountCache';

export const FOLLOWED_RAIL_WIDTH_PX = 48;

export type { FollowedChannelRailItem } from './followed-rail/types';

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 10_000) return `${(count / 1000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

export const FollowedChannelsRail: React.FC<FollowedChannelsRailProps> = ({
  side,
  channels,
  loading,
  error,
  canStartRaid,
  chatWidth,
  chatPanel,
  twitchUserId,
  twitchAvatarUrl,
  twitchDisplayName,
  streamViewerCount,
  selfViewerCountVisible,
  onSideChange,
  onSelfViewerCountVisibleChange,
  onOpenOverlay,
  onOpenOverlayDebug,
  onOpenPresent,
  onOpenPresentDebug,
  onAddIrcPreview,
  onStartRaid,
  onStartShoutout,
}) => {
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [raidConfirmChannelId, setRaidConfirmChannelId] = useState<string | null>(null);
  const [raidingChannelId, setRaidingChannelId] = useState<string | null>(null);
  const [shoutoutingChannelId, setShoutoutingChannelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ top: number; left: number } | null>(null);
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(() => readIrcChannels());

  const copiedResetTimerRef = useRef<number | null>(null);
  const { ensureFollowerCount, resolveFollowerCountLabel } = useFollowerCountCache(channels);

  useEffect(() => {
    if (openChannelId && !channels.some((item) => item.broadcaster_id === openChannelId)) {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
    }
  }, [channels, openChannelId]);

  useEffect(() => {
    if (!openChannelId) {
      setMenuAnchor(null);
      return;
    }

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-followed-menu="true"]')) return;
      if (target.closest('[data-followed-trigger="true"]')) return;
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
      setActionError('');
    };

    const closeByResize = () => {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
      setActionError('');
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('resize', closeByResize);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('resize', closeByResize);
    };
  }, [openChannelId]);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeIrcChannels((nextChannels) => {
      setIrcConnectedChannels(nextChannels);
    });
  }, []);

  useEffect(() => {
    if (canStartRaid) return;
    setRaidConfirmChannelId(null);
  }, [canStartRaid]);

  useEffect(() => {
    if (!railMenuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-rail-menu="true"]')) return;
      if (target.closest('[data-rail-trigger="true"]')) return;
      setRailMenuOpen(false);
    };

    const closeByEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRailMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeByEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeByEscape);
    };
  }, [railMenuOpen]);

  const closeChannelMenu = useCallback(() => {
    setOpenChannelId(null);
    setMenuAnchor(null);
    setRaidConfirmChannelId(null);
    setShoutoutingChannelId(null);
  }, []);

  const copyChannelLogin = useCallback(async (channel: FollowedChannelRailItem) => {
    const channelLogin = channel.broadcaster_login;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(channelLogin);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = channelLogin;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedChannelId(channel.broadcaster_id);
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopiedChannelId((current) => (current === channel.broadcaster_id ? null : current));
      }, 1200);
    } catch {
      setActionError('チャンネル名のコピーに失敗しました');
    }
  }, []);

  const connectChannel = useCallback((channel: FollowedChannelRailItem) => {
    const normalized = (channel.broadcaster_login || '').trim().toLowerCase();
    if (!normalized) return;
    if (!ircConnectedChannels.includes(normalized) && ircConnectedChannels.length >= MAX_IRC_CHANNELS) {
      setActionError(`IRCチャンネルの上限は${MAX_IRC_CHANNELS}件までです`);
      return;
    }
    setActionError('');
    onAddIrcPreview(channel.broadcaster_login);
    closeChannelMenu();
  }, [closeChannelMenu, ircConnectedChannels, onAddIrcPreview]);

  const startShoutout = useCallback(async (channel: FollowedChannelRailItem) => {
    setActionError('');
    setRaidConfirmChannelId(null);
    setShoutoutingChannelId(channel.broadcaster_id);
    try {
      await onStartShoutout(channel);
      closeChannelMenu();
    } catch (error: any) {
      setActionError(error?.message || '応援に失敗しました');
    } finally {
      setShoutoutingChannelId(null);
    }
  }, [closeChannelMenu, onStartShoutout]);

  const startRaid = useCallback(async (channel: FollowedChannelRailItem) => {
    if (raidConfirmChannelId !== channel.broadcaster_id) {
      setRaidConfirmChannelId(channel.broadcaster_id);
      setActionError('');
      return;
    }

    setActionError('');
    setRaidingChannelId(channel.broadcaster_id);
    try {
      await onStartRaid(channel);
      closeChannelMenu();
    } catch (error: any) {
      setActionError(error?.message || 'レイド開始に失敗しました');
    } finally {
      setRaidingChannelId(null);
    }
  }, [closeChannelMenu, onStartRaid, raidConfirmChannelId]);

  return (
    <div
      className={`hidden xl:flex fixed inset-y-0 z-[1700] bg-gray-900 ${side === 'left' ? 'left-0 flex-row' : 'right-0 flex-row-reverse'}`}
      style={{ width: `${FOLLOWED_RAIL_WIDTH_PX + chatWidth}px` }}
    >
      <div className={`w-12 shrink-0 border-gray-700 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="flex h-full flex-col items-center py-2">
          <FollowedRailQuickMenu
            side={side}
            railMenuOpen={railMenuOpen}
            twitchUserId={twitchUserId}
            twitchAvatarUrl={twitchAvatarUrl}
            twitchDisplayName={twitchDisplayName}
            streamViewerCount={streamViewerCount}
            selfViewerCountVisible={selfViewerCountVisible}
            onToggleMenu={() => setRailMenuOpen((prev) => !prev)}
            onCloseMenu={() => setRailMenuOpen(false)}
            onSideChange={onSideChange}
            onSelfViewerCountVisibleChange={onSelfViewerCountVisibleChange}
            onOpenOverlay={onOpenOverlay}
            onOpenOverlayDebug={onOpenOverlayDebug}
            onOpenPresent={onOpenPresent}
            onOpenPresentDebug={onOpenPresentDebug}
          />

          <div className="mb-2 h-px w-8 bg-gray-700" />

          <FollowedChannelsList
            side={side}
            channels={channels}
            loading={loading}
            openChannelId={openChannelId}
            menuAnchor={menuAnchor}
            hoveredChannelId={hoveredChannelId}
            hoverAnchor={hoverAnchor}
            ircConnectedChannels={ircConnectedChannels}
            copiedChannelId={copiedChannelId}
            raidConfirmChannelId={raidConfirmChannelId}
            raidingChannelId={raidingChannelId}
            shoutoutingChannelId={shoutoutingChannelId}
            actionError={actionError}
            canStartRaid={canStartRaid}
            resolveFollowerCountLabel={resolveFollowerCountLabel}
            ensureFollowerCount={ensureFollowerCount}
            formatViewerCount={formatViewerCount}
            onSelectChannel={(channel, rect) => {
              setActionError('');
              setRaidConfirmChannelId(null);
              setOpenChannelId(channel.broadcaster_id);
              const menuWidth = channel.is_live ? 340 : 192;
              const menuHeight = channel.is_live ? 420 : 230;
              const top = Math.max(12, Math.min(window.innerHeight - menuHeight - 12, rect.top + rect.height / 2 - menuHeight / 2));
              const left =
                side === 'left'
                  ? Math.min(window.innerWidth - menuWidth - 12, rect.right + 8)
                  : Math.max(12, rect.left - menuWidth - 8);
              setMenuAnchor({ top, left, width: menuWidth });
            }}
            onCloseChannel={() => {
              setOpenChannelId(null);
              setMenuAnchor(null);
              setShoutoutingChannelId(null);
              setRaidConfirmChannelId(null);
            }}
            onHoverChannel={(channelId, anchor) => {
              setHoveredChannelId(channelId);
              setHoverAnchor(anchor);
            }}
            onClearHover={(channelId) => {
              setHoveredChannelId((current) => (current === channelId ? null : current));
              setHoverAnchor(null);
            }}
            onCopyChannelLogin={copyChannelLogin}
            onConnect={connectChannel}
            onStartShoutout={startShoutout}
            onStartRaid={startRaid}
            onCancelRaidConfirm={() => setRaidConfirmChannelId(null)}
          />

          {!!error && (
            <div className="mt-2 w-full px-1 text-center text-[10px] leading-tight text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">{chatPanel}</div>
    </div>
  );
};
