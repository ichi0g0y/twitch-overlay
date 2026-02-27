import { Eye, EyeOff, Gift, Layers, Menu } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { buildApiUrl } from '../../../utils/api';

interface FollowedRailQuickMenuProps {
  side: 'left' | 'right';
  railMenuOpen: boolean;
  twitchUserId?: string;
  twitchAvatarUrl?: string;
  twitchDisplayName?: string;
  streamViewerCount: number | null;
  selfViewerCountVisible: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSideChange: (side: 'left' | 'right') => void;
  onSelfViewerCountVisibleChange: (visible: boolean) => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
}

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 10_000) return `${(count / 1000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

export const FollowedRailQuickMenu: React.FC<FollowedRailQuickMenuProps> = ({
  side,
  railMenuOpen,
  twitchUserId,
  twitchAvatarUrl,
  twitchDisplayName,
  streamViewerCount,
  selfViewerCountVisible,
  onToggleMenu,
  onCloseMenu,
  onSideChange,
  onSelfViewerCountVisibleChange,
  onOpenOverlay,
  onOpenOverlayDebug,
  onOpenPresent,
  onOpenPresentDebug,
}) => {
  const toggleLabel = side === 'left' ? '右側へ移動' : '左側へ移動';
  const normalizedAvatarUrl = useMemo(
    () => (twitchAvatarUrl || '').trim(),
    [twitchAvatarUrl],
  );
  const [avatarUrl, setAvatarUrl] = useState(normalizedAvatarUrl);
  const menuLabel = useMemo(() => {
    const name = (twitchDisplayName || '').trim();
    if (!name) return 'クイック操作メニュー';
    return `${name} のクイック操作メニュー`;
  }, [twitchDisplayName]);
  const viewerCountBadgeLabel = useMemo(() => {
    if (streamViewerCount == null) return '';
    return `接続数 ${formatViewerCount(streamViewerCount)}`;
  }, [streamViewerCount]);

  useEffect(() => {
    setAvatarUrl(normalizedAvatarUrl);
  }, [normalizedAvatarUrl]);

  useEffect(() => {
    if (avatarUrl) return;
    const userId = (twitchUserId || '').trim();
    if (!userId) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/chat/user-profile/detail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        const nextAvatarUrl = (
          typeof payload?.profile_image_url === 'string'
            ? payload.profile_image_url
            : (typeof payload?.avatar_url === 'string' ? payload.avatar_url : '')
        ).trim();
        if (cancelled || !nextAvatarUrl) return;
        setAvatarUrl(nextAvatarUrl);
      } catch {
        // noop
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [avatarUrl, twitchUserId]);

  return (
    <div className="relative mb-2">
      <button
        type="button"
        data-rail-trigger="true"
        onClick={onToggleMenu}
        className={`inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded border transition ${
          railMenuOpen
            ? 'border-blue-500/70 bg-blue-500/20'
            : 'border-gray-700 text-gray-300 hover:bg-gray-800'
        }`}
        aria-label={menuLabel}
        aria-expanded={railMenuOpen}
        title={menuLabel}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setAvatarUrl('')}
          />
        ) : (
          <Menu className="h-4 w-4" />
        )}
        {selfViewerCountVisible && streamViewerCount != null && (
          <span
            className="absolute -bottom-1 left-1/2 z-10 min-w-[16px] -translate-x-1/2 rounded-full border border-gray-900 bg-red-600 px-[2px] py-[2px] text-center text-[8px] font-bold leading-none text-white shadow"
            aria-label={viewerCountBadgeLabel}
            title={viewerCountBadgeLabel}
          >
            <span className="inline-block -translate-x-[1px]">
              {formatViewerCount(streamViewerCount)}
            </span>
          </span>
        )}
      </button>

      {railMenuOpen && (
        <div
          data-rail-menu="true"
          className={`absolute top-0 z-50 w-56 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl ${
            side === 'left' ? 'left-full ml-2' : 'right-full mr-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onSideChange(side === 'left' ? 'right' : 'left');
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            {toggleLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onSelfViewerCountVisibleChange(!selfViewerCountVisible);
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
            aria-pressed={selfViewerCountVisible}
          >
            {selfViewerCountVisible ? (
              <Eye className="h-3.5 w-3.5 text-gray-300" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-gray-300" />
            )}
            <span>接続数表示: {selfViewerCountVisible ? 'オン' : 'オフ'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenOverlay();
              onCloseMenu();
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
              onCloseMenu();
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
              onCloseMenu();
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
              onCloseMenu();
            }}
            className="inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            <Gift className="h-3.5 w-3.5 text-gray-300" />
            <span>プレゼント(デバッグ)</span>
          </button>
        </div>
      )}
    </div>
  );
};
