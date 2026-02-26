import React from 'react';
import { RefreshCw, Star } from 'lucide-react';
import { FAVORITES_SECTION_KEY } from './constants';
import { GroupNavAvatar } from './GroupNavAvatar';
import { EmoteCell } from './EmoteCell';
import { buildSubSectionsForSection, groupHeaderClass } from './sections';
import type { Emote, RenderGroup } from './types';

export const EmoteSectionList: React.FC<{
  favoriteEmotes: Emote[];
  filteredGroups: RenderGroup[];
  favoriteKeySet: Set<string>;
  scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onSelect: (name: string, url: string) => void;
  onToggleFavorite: (emote: Emote) => void;
  onScrollToGroup: (groupId: string) => void;
}> = ({
  favoriteEmotes,
  filteredGroups,
  favoriteKeySet,
  scrollContainerRef,
  sectionRefs,
  onSelect,
  onToggleFavorite,
  onScrollToGroup,
}) => {
  return (
    <div className="flex items-start gap-2">
      <div ref={scrollContainerRef} className="max-h-72 flex-1 space-y-2 overflow-y-auto pr-1">
        {favoriteEmotes.length > 0 && (
          <section
            key={FAVORITES_SECTION_KEY}
            ref={(node) => {
              sectionRefs.current[FAVORITES_SECTION_KEY] = node;
            }}
            className="space-y-1"
          >
            <div className="sticky top-0 z-10 w-full rounded-md bg-amber-100 px-2.5 py-2 text-xs font-semibold text-amber-900 backdrop-blur dark:bg-amber-500/20 dark:text-amber-100">
              <div className="flex min-h-5 items-center gap-2">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="truncate">お気に入り</span>
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-400/30 dark:text-amber-100">
                  {favoriteEmotes.length}
                </span>
              </div>
            </div>
            <div className="grid justify-items-center gap-1 [grid-template-columns:repeat(auto-fill,minmax(2rem,1fr))]">
              {favoriteEmotes.map((emote) => (
                <EmoteCell
                  key={`${FAVORITES_SECTION_KEY}:${emote.id}:${emote.name}:${emote.url}`}
                  emote={emote}
                  cellKey={`${FAVORITES_SECTION_KEY}:${emote.id}:${emote.name}:${emote.url}`}
                  favoriteKeySet={favoriteKeySet}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  showFavoriteToggle={false}
                />
              ))}
            </div>
          </section>
        )}

        {filteredGroups.map((group) => (
          <section
            key={group.id}
            ref={(node) => {
              sectionRefs.current[group.id] = node;
            }}
            className="space-y-1"
          >
            <div className={`sticky top-0 z-10 w-full rounded-md px-2.5 py-2 text-xs font-semibold backdrop-blur ${groupHeaderClass(group)}`}>
              <div className="flex min-h-5 items-center gap-2">
                {group.channelLogin && group.channelAvatarUrl && (
                  <img
                    src={group.channelAvatarUrl}
                    alt={`${group.label} avatar`}
                    className="h-5 w-5 rounded-full object-cover"
                    loading="lazy"
                  />
                )}
                <span className="truncate">{group.label}</span>
                {group.loading && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-gray-900/60 dark:text-blue-200">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    読み込み中
                  </span>
                )}
              </div>
            </div>

            {group.loading ? (
              <div className="rounded-md border border-dashed border-gray-200/80 bg-gray-50/80 p-2 dark:border-gray-700/80 dark:bg-gray-800/40">
                <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 grid grid-cols-6 gap-1">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <span
                      key={`${group.id}:loading:${idx}`}
                      className="inline-block h-8 w-8 animate-pulse rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {group.sections.map((section) => {
                  const subSections = buildSubSectionsForSection(section);
                  const hasMultipleSubSections = subSections.length > 1;
                  return (
                    <div key={`${group.id}:${section.key}`} className="space-y-1">
                      {hasMultipleSubSections && (
                        <div className="mb-1 flex items-center justify-start gap-1.5">
                          <span className="inline-flex px-1 py-0 text-[10px] font-medium leading-none text-gray-400 dark:text-gray-500">
                            {section.label}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{section.emotes.length}</span>
                        </div>
                      )}
                      {subSections.map((subSection) => (
                        <div key={`${group.id}:${section.key}:${subSection.key}`} className="space-y-1 rounded-md border border-gray-200/70 bg-gray-50/80 p-1.5 dark:border-gray-700/70 dark:bg-gray-800/40">
                          <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                            <span>{subSection.label}</span>
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                              {subSection.emotes.length}
                            </span>
                          </div>
                          <div className="grid justify-items-center gap-1 [grid-template-columns:repeat(auto-fill,minmax(2rem,1fr))]">
                            {subSection.emotes.map((emote) => (
                              <EmoteCell
                                key={`${group.id}:${section.key}:${subSection.key}:${emote.id}:${emote.name}:${emote.url}`}
                                emote={emote}
                                cellKey={`${group.id}:${section.key}:${subSection.key}:${emote.id}:${emote.name}:${emote.url}`}
                                favoriteKeySet={favoriteKeySet}
                                onSelect={onSelect}
                                onToggleFavorite={onToggleFavorite}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="max-h-72 w-9 shrink-0 space-y-1 overflow-y-auto pl-0.5">
        {favoriteEmotes.length > 0 && (
          <button
            key={`jump:${FAVORITES_SECTION_KEY}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onScrollToGroup(FAVORITES_SECTION_KEY)}
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
            aria-label="お気に入りセクションへ移動"
            title="お気に入りセクションへ移動"
          >
            <Star className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        {filteredGroups.map((group) => (
          <button
            key={`jump:${group.id}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onScrollToGroup(group.id)}
            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border text-gray-700 transition-colors hover:bg-white hover:text-gray-900 dark:text-gray-200 dark:hover:bg-gray-700 ${
              group.loading
                ? 'border-blue-300 bg-blue-100 ring-1 ring-blue-300/80 dark:border-blue-500/60 dark:bg-blue-500/20 dark:ring-blue-500/40'
                : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800'
            }`}
            aria-label={`${group.label} セクションへ移動${group.loading ? '（読み込み中）' : ''}`}
            title={`${group.label} セクションへ移動${group.loading ? '（読み込み中）' : ''}`}
          >
            <GroupNavAvatar group={group} />
            {group.loading && (
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-500/70 dark:bg-blue-900/80 dark:text-blue-200">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
