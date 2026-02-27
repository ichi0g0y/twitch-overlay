import React from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { EmoteInfoPopupState } from './types';

export const EmoteInfoModal: React.FC<{
  open: boolean;
  emoteInfoPopup: EmoteInfoPopupState | null;
  onClose: () => void;
}> = ({
  open,
  emoteInfoPopup,
  onClose,
}) => {
  if (!open || !emoteInfoPopup) return null;

  const fragment = emoteInfoPopup.fragment;
  const emoteId = (fragment.emoteId || '').trim();
  const emoteSetId = (fragment.emoteSetId || '').trim();
  const emoteOwnerId = (fragment.emoteOwnerId || '').trim();
  const channelLogin = (emoteInfoPopup.channelLogin || '').trim().toLowerCase();
  const channelUrl = channelLogin ? `https://www.twitch.tv/${channelLogin}` : '';
  const hasNumericOwnerId = emoteOwnerId !== '' && emoteOwnerId !== '0' && /^[0-9]+$/.test(emoteOwnerId);
  const isResolvingOwner = emoteInfoPopup.source === 'channel' && channelLogin === '' && emoteId !== '' && !hasNumericOwnerId;
  const sourceLabel = emoteInfoPopup.source === 'global'
    ? 'Global'
    : isResolvingOwner
      ? 'Channel (resolving...)'
      : (channelLogin ? 'Channel' : 'Channel (unresolved)');

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">エモート情報</h3>
          <div className="flex items-center gap-1">
            {channelUrl && (
              <a
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label={`${channelLogin} のチャンネルを開く`}
                title="チャンネルを開く"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="エモート情報ポップアップを閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3 text-sm">
          <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            {fragment.emoteUrl ? (
              <img src={fragment.emoteUrl} alt={fragment.text} className="h-10 w-10 object-contain" loading="lazy" />
            ) : (
              <div className="h-10 w-10 rounded bg-gray-200 dark:bg-gray-700" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-800 dark:text-gray-100">{fragment.text || '(name unknown)'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{sourceLabel}</p>
              {isResolvingOwner && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  チャンネル情報を取得中...
                </p>
              )}
            </div>
          </div>

          <table className="w-full text-xs text-gray-600 dark:text-gray-300">
            <tbody className="[&>tr:not(:last-child)]:border-b [&>tr:not(:last-child)]:border-gray-200/70 dark:[&>tr:not(:last-child)]:border-gray-700/70">
              <tr>
                <th className="w-[96px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">Emote ID</th>
                <td className="py-1.5 break-all font-mono">{emoteId || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[96px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">Set ID</th>
                <td className="py-1.5 break-all font-mono">{emoteSetId || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[96px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">Owner ID</th>
                <td className="py-1.5 break-all font-mono">{emoteOwnerId || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[96px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">Channel</th>
                <td className="py-1.5 break-all">{channelLogin ? `@${channelLogin}` : 'Global / 不明'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
