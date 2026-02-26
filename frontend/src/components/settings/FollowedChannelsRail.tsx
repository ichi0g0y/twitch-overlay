import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Layers, Menu } from 'lucide-react';

import { buildApiUrl } from '../../utils/api';
import { readIrcChannels, subscribeIrcChannels } from '../../utils/chatChannels';
import { FollowedChannelPopover } from './FollowedChannelPopover';

const FOLLOWER_COUNT_RETRY_COOLDOWN_MS = 60_000;
export const FOLLOWED_RAIL_WIDTH_PX = 48;

export type FollowedChannelRailItem = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  profile_image_url: string;
  followed_at?: string;
  is_live: boolean;
  viewer_count: number;
  follower_count?: number | null;
  title?: string | null;
  game_name?: string | null;
  started_at?: string | null;
  last_broadcast_at?: string | null;
};

type FollowedChannelsRailProps = {
  side: "left" | "right";
  channels: FollowedChannelRailItem[];
  loading: boolean;
  error: string;
  canStartRaid: boolean;
  chatWidth: number;
  chatPanel: React.ReactNode;
  onSideChange: (side: "left" | "right") => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
  onAddIrcPreview: (channelLogin: string) => void;
  onStartRaid: (channel: FollowedChannelRailItem) => Promise<void>;
  onStartShoutout: (channel: FollowedChannelRailItem) => Promise<void>;
};

function formatViewerCount(count: number): string {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 10_000) return `${(count / 1000).toFixed(0)}K`;
  if (count >= 1_000)
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
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
  onSideChange,
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
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [raidConfirmChannelId, setRaidConfirmChannelId] = useState<
    string | null
  >(null);
  const [raidingChannelId, setRaidingChannelId] = useState<string | null>(null);
  const [shoutoutingChannelId, setShoutoutingChannelId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState("");
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(
    () => readIrcChannels(),
  );
  const [followerCountByChannelId, setFollowerCountByChannelId] = useState<
    Record<string, number>
  >({});
  const [loadingFollowerChannelIds, setLoadingFollowerChannelIds] = useState<
    Record<string, true>
  >({});
  const followerCountByChannelIdRef = useRef<Record<string, number>>({});
  const followerCountFetchInFlightRef = useRef<Set<string>>(new Set());
  const followerCountRetryAfterByChannelIdRef = useRef<Record<string, number>>(
    {},
  );
  const copiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    followerCountByChannelIdRef.current = followerCountByChannelId;
  }, [followerCountByChannelId]);

  useEffect(() => {
    if (
      openChannelId &&
      !channels.some((item) => item.broadcaster_id === openChannelId)
    ) {
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
      setActionError("");
    };

    const closeByResize = () => {
      setOpenChannelId(null);
      setMenuAnchor(null);
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(null);
      setActionError("");
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("resize", closeByResize);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("resize", closeByResize);
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
    return subscribeIrcChannels((channels) => {
      setIrcConnectedChannels(channels);
    });
  }, []);

  useEffect(() => {
    setFollowerCountByChannelId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const channel of channels) {
        const channelId = (channel.broadcaster_id || "").trim();
        if (channelId === "") continue;
        if (typeof channel.follower_count !== "number") continue;
        if (next[channelId] === channel.follower_count) continue;
        next[channelId] = channel.follower_count;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [channels]);

  const ensureFollowerCount = useCallback(
    async (channel: FollowedChannelRailItem) => {
      const channelId = (channel.broadcaster_id || "").trim();
      if (channelId === "") return;
      const retryAfterAt =
        followerCountRetryAfterByChannelIdRef.current[channelId] || 0;
      if (retryAfterAt > Date.now()) {
        return;
      }
      if (typeof followerCountByChannelIdRef.current[channelId] === "number") {
        return;
      }
      if (typeof channel.follower_count === "number") {
        const immediateFollowerCount = channel.follower_count;
        setFollowerCountByChannelId((prev) => {
          if (prev[channelId] === immediateFollowerCount) return prev;
          return { ...prev, [channelId]: immediateFollowerCount };
        });
        return;
      }
      if (followerCountFetchInFlightRef.current.has(channelId)) {
        return;
      }

      followerCountFetchInFlightRef.current.add(channelId);
      setLoadingFollowerChannelIds((prev) => ({ ...prev, [channelId]: true }));
      try {
        const response = await fetch(
          buildApiUrl("/api/chat/user-profile/detail"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: channelId,
              login: channel.broadcaster_login,
              username: channel.broadcaster_login,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json().catch(() => null);
        const followerCount =
          typeof payload?.follower_count === "number"
            ? payload.follower_count
            : undefined;
        if (typeof followerCount === "number") {
          delete followerCountRetryAfterByChannelIdRef.current[channelId];
          setFollowerCountByChannelId((prev) => {
            if (prev[channelId] === followerCount) return prev;
            return { ...prev, [channelId]: followerCount };
          });
        } else {
          followerCountRetryAfterByChannelIdRef.current[channelId] =
            Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
          setFollowerCountByChannelId((prev) => {
            if (!(channelId in prev)) return prev;
            const next = { ...prev };
            delete next[channelId];
            return next;
          });
        }
      } catch {
        followerCountRetryAfterByChannelIdRef.current[channelId] =
          Date.now() + FOLLOWER_COUNT_RETRY_COOLDOWN_MS;
      } finally {
        followerCountFetchInFlightRef.current.delete(channelId);
        setLoadingFollowerChannelIds((prev) => {
          if (!(channelId in prev)) return prev;
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    },
    [],
  );

  const resolveFollowerCountLabel = useCallback(
    (channel: FollowedChannelRailItem) => {
      const channelId = (channel.broadcaster_id || "").trim();
      const cached = channelId
        ? followerCountByChannelId[channelId]
        : undefined;
      const rawCount =
        typeof cached === "number"
          ? cached
          : typeof channel.follower_count === "number"
            ? channel.follower_count
            : undefined;
      if (typeof rawCount === "number") {
        return rawCount.toLocaleString("ja-JP");
      }
      if (channelId && loadingFollowerChannelIds[channelId]) {
        return "取得中...";
      }
      return "不明";
    },
    [followerCountByChannelId, loadingFollowerChannelIds],
  );

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
      if (event.key === "Escape") {
        setRailMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeByEscape);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeByEscape);
    };
  }, [railMenuOpen]);

  const toggleLabel = side === "left" ? "右側へ移動" : "左側へ移動";
  const hoveredChannel = hoveredChannelId
    ? (channels.find((item) => item.broadcaster_id === hoveredChannelId) ??
      null)
    : null;
  const closeChannelMenu = useCallback(() => {
    setOpenChannelId(null);
    setMenuAnchor(null);
    setRaidConfirmChannelId(null);
    setShoutoutingChannelId(null);
  }, []);
  const copyChannelLogin = useCallback(
    async (channel: FollowedChannelRailItem) => {
      const channelLogin = channel.broadcaster_login;
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(channelLogin);
        } else if (typeof document !== "undefined") {
          const textarea = document.createElement("textarea");
          textarea.value = channelLogin;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setCopiedChannelId(channel.broadcaster_id);
        if (copiedResetTimerRef.current !== null) {
          window.clearTimeout(copiedResetTimerRef.current);
        }
        copiedResetTimerRef.current = window.setTimeout(() => {
          setCopiedChannelId((current) =>
            current === channel.broadcaster_id ? null : current,
          );
        }, 1200);
      } catch {
        setActionError("チャンネル名のコピーに失敗しました");
      }
    },
    [],
  );
  const connectChannel = useCallback(
    (channel: FollowedChannelRailItem) => {
      onAddIrcPreview(channel.broadcaster_login);
      closeChannelMenu();
    },
    [closeChannelMenu, onAddIrcPreview],
  );
  const startShoutout = useCallback(
    async (channel: FollowedChannelRailItem) => {
      setActionError("");
      setRaidConfirmChannelId(null);
      setShoutoutingChannelId(channel.broadcaster_id);
      try {
        await onStartShoutout(channel);
        closeChannelMenu();
      } catch (error: any) {
        setActionError(error?.message || "応援に失敗しました");
      } finally {
        setShoutoutingChannelId(null);
      }
    },
    [closeChannelMenu, onStartShoutout],
  );
  const startRaid = useCallback(
    async (channel: FollowedChannelRailItem) => {
      if (raidConfirmChannelId !== channel.broadcaster_id) {
        setRaidConfirmChannelId(channel.broadcaster_id);
        setActionError("");
        return;
      }
      setActionError("");
      setRaidingChannelId(channel.broadcaster_id);
      try {
        await onStartRaid(channel);
        closeChannelMenu();
      } catch (error: any) {
        setActionError(error?.message || "レイド開始に失敗しました");
      } finally {
        setRaidingChannelId(null);
      }
    },
    [closeChannelMenu, onStartRaid, raidConfirmChannelId],
  );

  return (
    <div
      className={`hidden xl:flex fixed inset-y-0 z-[1700] bg-gray-900 ${side === "left" ? "left-0 flex-row" : "right-0 flex-row-reverse"}`}
      style={{ width: `${FOLLOWED_RAIL_WIDTH_PX + chatWidth}px` }}
    >
      <div
        className={`w-12 shrink-0 border-gray-700 ${side === "left" ? "border-r" : "border-l"}`}
      >
        <div className="flex h-full flex-col items-center py-2">
          <div className="relative mb-2">
            <button
              type="button"
              data-rail-trigger="true"
              onClick={() => setRailMenuOpen((prev) => !prev)}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
              aria-label="クイック操作メニュー"
              aria-expanded={railMenuOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
            {railMenuOpen && (
              <div
                data-rail-menu="true"
                className={`absolute top-0 z-50 w-56 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl ${
                  side === "left" ? "left-full ml-2" : "right-full mr-2"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSideChange(side === "left" ? "right" : "left");
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  {toggleLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenOverlay();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Layers className="h-3.5 w-3.5 text-gray-300" />
                  <span>オーバーレイ表示</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenOverlayDebug();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Layers className="h-3.5 w-3.5 text-gray-300" />
                  <span>オーバーレイ表示(デバッグ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPresent();
                    setRailMenuOpen(false);
                  }}
                  className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Gift className="h-3.5 w-3.5 text-gray-300" />
                  <span>プレゼントルーレット</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPresentDebug();
                    setRailMenuOpen(false);
                  }}
                  className="inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Gift className="h-3.5 w-3.5 text-gray-300" />
                  <span>プレゼント(デバッグ)</span>
                </button>
              </div>
            )}
          </div>
          <div className="mb-2 h-px w-8 bg-gray-700" />
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
              const channelDisplayName =
                channel.broadcaster_name || channel.broadcaster_login;
              const channelLogin = channel.broadcaster_login;
              const followerCountLabel = resolveFollowerCountLabel(channel);
              const normalizedChannelLogin = channelLogin.trim().toLowerCase();
              const alreadyConnected = ircConnectedChannels.includes(
                normalizedChannelLogin,
              );
              return (
                <div
                  key={channel.broadcaster_id}
                  className="group relative flex justify-center"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      const nextOpen = openChannelId !== channel.broadcaster_id;
                      setActionError("");
                      setRaidConfirmChannelId(null);
                      setOpenChannelId(
                        nextOpen ? channel.broadcaster_id : null,
                      );
                      if (!nextOpen) {
                        setMenuAnchor(null);
                        setShoutoutingChannelId(null);
                        return;
                      }
                      const rect = (
                        event.currentTarget as HTMLButtonElement
                      ).getBoundingClientRect();
                      const menuWidth = channel.is_live ? 340 : 192;
                      const menuHeight = channel.is_live ? 420 : 230;
                      const top = Math.max(
                        12,
                        Math.min(
                          window.innerHeight - menuHeight - 12,
                          rect.top + rect.height / 2 - menuHeight / 2,
                        ),
                      );
                      const left =
                        side === "left"
                          ? Math.min(
                              window.innerWidth - menuWidth - 12,
                              rect.right + 8,
                            )
                          : Math.max(12, rect.left - menuWidth - 8);
                      setMenuAnchor({ top, left, width: menuWidth });
                      void ensureFollowerCount(channel);
                    }}
                    className={`relative h-9 w-9 rounded-full border transition ${
                      selected
                        ? "border-blue-400 ring-1 ring-blue-400/60"
                        : "border-gray-700 hover:border-gray-500"
                    }`}
                    onMouseEnter={(event) => {
                      const rect = (
                        event.currentTarget as HTMLButtonElement
                      ).getBoundingClientRect();
                      setHoveredChannelId(channel.broadcaster_id);
                      setHoverAnchor({
                        top: rect.top + rect.height / 2,
                        left: side === "left" ? rect.right + 8 : rect.left - 8,
                      });
                      void ensureFollowerCount(channel);
                    }}
                    onMouseMove={(event) => {
                      const rect = (
                        event.currentTarget as HTMLButtonElement
                      ).getBoundingClientRect();
                      setHoveredChannelId(channel.broadcaster_id);
                      setHoverAnchor({
                        top: rect.top + rect.height / 2,
                        left: side === "left" ? rect.right + 8 : rect.left - 8,
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredChannelId((current) =>
                        current === channel.broadcaster_id ? null : current,
                      );
                      setHoverAnchor(null);
                    }}
                    aria-label={`${channelDisplayName} の操作を開く`}
                    data-followed-trigger="true"
                  >
                    <span className="block h-full w-full overflow-hidden rounded-full">
                      {channel.profile_image_url ? (
                        <img
                          src={channel.profile_image_url}
                          alt={channelDisplayName}
                          className={`h-full w-full object-cover ${channel.is_live ? "" : "grayscale opacity-70"}`}
                        />
                      ) : (
                        <span
                          className={`flex h-full w-full items-center justify-center bg-gray-700 text-xs font-semibold ${channel.is_live ? "text-white" : "text-gray-300"}`}
                        >
                          {(channelDisplayName || "?")
                            .slice(0, 1)
                            .toUpperCase()}
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
                      onCopyChannelLogin={copyChannelLogin}
                      onConnect={connectChannel}
                      onStartShoutout={startShoutout}
                      onStartRaid={startRaid}
                      onCancelRaidConfirm={() => setRaidConfirmChannelId(null)}
                    />
                  )}
                </div>
              );
            })}
            {hoveredChannel && hoverAnchor && (
              <div
                className={`pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-100 shadow ${
                  side === "left" ? "" : "-translate-x-full"
                }`}
                style={{
                  top: `${hoverAnchor.top}px`,
                  left: `${hoverAnchor.left}px`,
                }}
              >
                <div className="font-semibold leading-tight">
                  {hoveredChannel.broadcaster_name ||
                    hoveredChannel.broadcaster_login}
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
          </div>
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

