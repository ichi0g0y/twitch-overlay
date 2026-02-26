import React from 'react';
import { Users, X } from 'lucide-react';
import type { ChatMessage } from '../ChatSidebarItem';
import type {
  ChattersPanelChatter,
  HydratedChatterProfile,
} from './types';
import { formatFollowerTooltip } from './types';

type ChattersPanelContentProps = {
  open: boolean;
  headlineCount: number;
  loading: boolean;
  error: string;
  notice: string;
  hydratingCount: number;
  chatterRows: Array<{ key: string; chatter: ChattersPanelChatter }>;
  hydratedProfiles: Record<string, HydratedChatterProfile>;
  hydratingProfileKeys: Record<string, true>;
  listContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  setRowRef: (key: string, node: HTMLLIElement | null) => void;
  onChatterClick?: (message: ChatMessage) => void;
  onClose: () => void;
};

export const ChattersPanelContent: React.FC<ChattersPanelContentProps> = ({
  open,
  headlineCount,
  loading,
  error,
  notice,
  hydratingCount,
  chatterRows,
  hydratedProfiles,
  hydratingProfileKeys,
  listContainerRef,
  setRowRef,
  onChatterClick,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Users className="h-4 w-4" />
            {`視聴者一覧 (${headlineCount}人)`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="視聴者一覧を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listContainerRef} className="max-h-[60vh] overflow-y-auto px-4 py-3 text-sm">
          {!loading && !error && hydratingCount > 0 && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {`プロフィールを補完中... (${hydratingCount}件)`}
            </p>
          )}
          {loading && <p className="text-xs text-blue-600 dark:text-blue-300">視聴者一覧を取得中...</p>}
          {!loading && !error && notice && (
            <p className="mb-2 text-xs text-amber-600 dark:text-amber-300">{notice}</p>
          )}
          {!loading && error && <p className="text-xs text-amber-600 dark:text-amber-300">{error}</p>}
          {!loading && !error && chatterRows.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">現在表示できる視聴者はいません。</p>
          )}
          {!loading && !error && chatterRows.length > 0 && (
            <ul className="divide-y divide-gray-200/70 dark:divide-gray-700/70">
              {chatterRows.map(({ key, chatter }) => {
                const profile = hydratedProfiles[key];
                const userLogin = (profile?.userLogin || chatter.user_login || '').trim().toLowerCase();
                const displayName = (profile?.displayName || chatter.user_name || userLogin || 'Unknown').trim();
                const avatarUrl = (profile?.avatarUrl || '').trim();
                const followerCount = profile?.followerCount ?? null;
                const isHydrating = !profile && !!hydratingProfileKeys[key];
                const tooltipTitle = formatFollowerTooltip(displayName, followerCount);
                const handleClick = () => {
                  if (!onChatterClick) return;
                  onChatterClick({
                    id: '',
                    userId: (profile?.userId || chatter.user_id || '').trim(),
                    username: userLogin || displayName,
                    displayName,
                    avatarUrl,
                    message: '',
                  });
                };

                return (
                  <li
                    key={key}
                    ref={(node) => setRowRef(key, node)}
                    data-profile-key={key}
                    className={`flex items-center gap-3 py-2 ${onChatterClick ? 'cursor-pointer' : ''}`}
                    onClick={handleClick}
                  >
                    {avatarUrl !== '' ? (
                      <img
                        src={avatarUrl}
                        alt={`${displayName} avatar`}
                        loading="lazy"
                        title={tooltipTitle}
                        className="h-8 w-8 rounded-full border border-gray-200 object-cover dark:border-gray-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : isHydrating ? (
                      <div className="h-8 w-8 animate-pulse rounded-full border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700" />
                    ) : (
                      <div
                        title={tooltipTitle}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {(displayName || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {displayName}
                        {isHydrating && (
                          <span className="ml-2 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                            読み込み中...
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {userLogin ? `@${userLogin}` : 'login不明'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
