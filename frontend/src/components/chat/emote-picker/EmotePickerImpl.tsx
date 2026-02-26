import React from 'react';
import { Smile } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Button } from '../../ui/button';
import { DASHBOARD_FONT_FAMILY } from './constants';
import { EmotePickerContent } from './EmotePickerContent';
import { useEmotePickerData } from './useEmotePickerData';
import type { EmotePickerProps } from './types';

export const EmotePicker: React.FC<EmotePickerProps> = ({
  disabled = false,
  channelLogins = [],
  priorityChannelLogin,
  onSelect,
  triggerClassName,
  triggerVariant = 'outline',
}) => {
  const {
    open,
    setOpen,
    loading,
    error,
    warning,
    keyword,
    setKeyword,
    favoriteEmotes,
    filteredGroups,
    favoriteKeySet,
    hasVisibleContent,
    scrollContainerRef,
    sectionRefs,
    handleRefresh,
    toggleFavorite,
    scrollToGroup,
  } = useEmotePickerData({ channelLogins, priorityChannelLogin });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant={triggerVariant}
          className={triggerClassName && triggerClassName.trim() !== '' ? triggerClassName : 'h-9 w-9 px-0'}
          aria-label="エモートを選択"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <Smile className="h-4 w-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-[1800] w-[360px] rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
        >
          <EmotePickerContent
            loading={loading}
            error={error}
            warning={warning}
            keyword={keyword}
            onKeywordChange={setKeyword}
            onRefresh={handleRefresh}
            favoriteEmotes={favoriteEmotes}
            filteredGroups={filteredGroups}
            favoriteKeySet={favoriteKeySet}
            hasVisibleContent={hasVisibleContent}
            scrollContainerRef={scrollContainerRef}
            sectionRefs={sectionRefs}
            onSelect={onSelect}
            onToggleFavorite={toggleFavorite}
            onScrollToGroup={scrollToGroup}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
