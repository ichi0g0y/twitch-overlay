import React from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import type { UserInfoPopupState } from './types';

export const UserInfoModal: React.FC<{
  open: boolean;
  userInfoPopup: UserInfoPopupState | null;
  onClose: () => void;
  popupChannelUrl: string;
  popupChannelLogin: string;
  popupProfileCover: string;
  popupProfileName: string;
  popupProfileAvatar: string;
  popupProfileLogin: string;
  popupProfileDescription: string;
  userInfoLoading: boolean;
  userInfoError: string;
  userModerationMessage: string;
  userInfoCanTimeout: boolean;
  userInfoCanBlock: boolean;
  moderationUnavailableReason: string;
  userModerationLoading: 'timeout' | 'block' | null;
  onRunModerationAction: (action: 'timeout' | 'block') => void;
  userInfoResolvedUserId: string;
  userInfoIdCopied: boolean;
  onCopyUserInfoUserId: () => void;
  userInfoCreatedAtLabel: string;
  userInfoFollowerCountLabel: string;
  userInfoTypeLabel: string;
}> = ({
  open,
  userInfoPopup,
  onClose,
  popupChannelUrl,
  popupChannelLogin,
  popupProfileCover,
  popupProfileName,
  popupProfileAvatar,
  popupProfileLogin,
  popupProfileDescription,
  userInfoLoading,
  userInfoError,
  userModerationMessage,
  userInfoCanTimeout,
  userInfoCanBlock,
  moderationUnavailableReason,
  userModerationLoading,
  onRunModerationAction,
  userInfoResolvedUserId,
  userInfoIdCopied,
  onCopyUserInfoUserId,
  userInfoCreatedAtLabel,
  userInfoFollowerCountLabel,
  userInfoTypeLabel,
}) => {
  if (!open || !userInfoPopup) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">ユーザー情報</h3>
          <div className="flex items-center gap-1">
            {popupChannelUrl && (
              <a
                href={popupChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label={`${popupChannelLogin} のチャンネルを開く`}
                title="チャンネルを開く"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="ユーザー情報ポップアップを閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3 text-sm">
          <div className={`relative overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 ${popupProfileCover ? '' : 'bg-gradient-to-r from-slate-500 to-blue-500'}`}>
            {popupProfileCover
              ? <img src={popupProfileCover} alt={`${popupProfileName || userInfoPopup.message.username} cover`} className="h-24 w-full object-cover" loading="lazy" />
              : <div className="h-24 w-full" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
              {popupProfileAvatar ? (
                <img src={popupProfileAvatar} alt={`${popupProfileName || userInfoPopup.message.username} avatar`} className="h-12 w-12 rounded-full border-2 border-white/70 object-cover" loading="lazy" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/70 bg-gray-200 text-base font-semibold text-gray-700">
                  {(popupProfileName || userInfoPopup.message.username || '?').slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 pb-0.5 text-white">
                <div className="truncate text-sm font-semibold">{popupProfileName || userInfoPopup.message.username || 'Unknown'}</div>
                <div className="truncate text-xs text-white/85">{popupProfileLogin ? `@${popupProfileLogin}` : ''}</div>
              </div>
            </div>
          </div>

          {userInfoLoading && <p className="text-xs text-blue-600 dark:text-blue-300">プロフィールを取得中...</p>}
          {userInfoError && <p className="text-xs text-amber-600 dark:text-amber-300">{userInfoError}</p>}
          {userModerationMessage && <p className="text-xs text-emerald-600 dark:text-emerald-300">{userModerationMessage}</p>}

          {(userInfoCanTimeout || userInfoCanBlock || moderationUnavailableReason !== '') && (
            <div className="rounded-md border border-red-200 bg-red-50/70 p-2 dark:border-red-500/40 dark:bg-red-900/20">
              <p className="mb-2 text-[11px] text-red-700 dark:text-red-200">モデレーション操作（確認ダイアログ後に実行）</p>
              {moderationUnavailableReason !== '' && (
                <p className="mb-2 text-[11px] text-red-700/90 dark:text-red-200/90">{moderationUnavailableReason}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onRunModerationAction('timeout')}
                  disabled={userModerationLoading !== null || !userInfoCanTimeout}
                  className="inline-flex h-7 items-center rounded-md border border-red-300 px-2 text-xs text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/50 dark:text-red-100 dark:hover:bg-red-800/50"
                >
                  {userModerationLoading === 'timeout' ? '実行中...' : '10分タイムアウト'}
                </button>
                <button
                  type="button"
                  onClick={() => onRunModerationAction('block')}
                  disabled={userModerationLoading !== null || !userInfoCanBlock}
                  className="inline-flex h-7 items-center rounded-md border border-red-400 px-2 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400 dark:text-red-100 dark:hover:bg-red-800/60"
                >
                  {userModerationLoading === 'block' ? '実行中...' : 'ブロック'}
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-xs text-gray-600 dark:text-gray-300">
            <tbody className="[&>tr:not(:last-child)]:border-b [&>tr:not(:last-child)]:border-gray-200/70 dark:[&>tr:not(:last-child)]:border-gray-700/70">
              <tr>
                <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">ユーザーID</th>
                <td className="py-1.5">
                  <div className="flex items-start gap-1">
                    <span className="min-w-0 break-all font-mono">{userInfoResolvedUserId || '不明'}</span>
                    {userInfoResolvedUserId !== '' && (
                      <button
                        type="button"
                        onClick={onCopyUserInfoUserId}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label="ユーザーIDをコピー"
                        title="ユーザーIDをコピー"
                      >
                        {userInfoIdCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              <tr>
                <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">アカウント作成</th>
                <td className="py-1.5">{userInfoCreatedAtLabel || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">フォロワー数</th>
                <td className="py-1.5">{userInfoFollowerCountLabel || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">種別</th>
                <td className="py-1.5 break-words">{userInfoTypeLabel || '不明'}</td>
              </tr>
              <tr>
                <th className="w-[92px] py-1.5 pr-2 text-left font-normal text-gray-500 dark:text-gray-400">自己紹介</th>
                <td className="py-1.5 break-words">{popupProfileDescription || '（なし）'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
