import React from 'react';
import { RefreshCw } from 'lucide-react';
import { EmoteSectionList } from './EmoteSectionList';
import type { Emote, RenderGroup } from './types';

export const EmotePickerContent: React.FC<{
  loading: boolean;
  error: string;
  warning: string;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onRefresh: () => void;
  favoriteEmotes: Emote[];
  filteredGroups: RenderGroup[];
  favoriteKeySet: Set<string>;
  hasVisibleContent: boolean;
  scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onSelect: (name: string, url: string) => void;
  onToggleFavorite: (emote: Emote) => void;
  onScrollToGroup: (groupId: string) => void;
}> = ({
  loading,
  error,
  warning,
  keyword,
  onKeywordChange,
  onRefresh,
  favoriteEmotes,
  filteredGroups,
  favoriteKeySet,
  hasVisibleContent,
  scrollContainerRef,
  sectionRefs,
  onSelect,
  onToggleFavorite,
  onScrollToGroup,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="エモート検索"
          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:ring-offset-gray-900 dark:focus-visible:ring-blue-600"
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="エモート一覧を更新"
          title="エモート一覧を更新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && filteredGroups.length === 0 && (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">読み込み中...</p>
      )}
      {error !== '' && filteredGroups.length === 0 && (
        <p className="py-6 text-center text-xs text-red-500 dark:text-red-300">{error}</p>
      )}
      {warning !== '' && (
        <p className="rounded border border-amber-300/60 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {warning}
        </p>
      )}
      {error !== '' && filteredGroups.length > 0 && (
        <p className="rounded border border-red-300/60 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      )}
      {!loading && error === '' && !hasVisibleContent && (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">該当するエモートがありません</p>
      )}

      {hasVisibleContent && (
        <EmoteSectionList
          favoriteEmotes={favoriteEmotes}
          filteredGroups={filteredGroups}
          favoriteKeySet={favoriteKeySet}
          scrollContainerRef={scrollContainerRef}
          sectionRefs={sectionRefs}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          onScrollToGroup={onScrollToGroup}
        />
      )}
    </div>
  );
};
