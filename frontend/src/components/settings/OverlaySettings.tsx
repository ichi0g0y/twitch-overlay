import React, { useContext } from 'react';

import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { ClockCard } from './overlay/ClockCard';
import { FaxCard } from './overlay/FaxCard';
import { LotteryCard } from './overlay/LotteryCard';
import { MicTranscriptCard } from './overlay/MicTranscriptCard';
import { MusicPlayerCard } from './overlay/MusicPlayerCard';
import { RewardCountCard } from './overlay/RewardCountCard';
import type { ColumnKey, OverlayCardKey } from './overlay/types';
import { useOverlayCardLayout } from './overlay/useOverlayCardLayout';
import { useOverlayLottery } from './overlay/useOverlayLottery';
import { useOverlayMusic } from './overlay/useOverlayMusic';
import { useOverlayRewardCount } from './overlay/useOverlayRewardCount';

export type { OverlayCardKey } from './overlay/types';

interface OverlaySettingsProps {
  focusCard?: OverlayCardKey;
}

export const OverlaySettings: React.FC<OverlaySettingsProps> = ({ focusCard }) => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('OverlaySettings must be used within SettingsPageProvider');
  }

  const {
    overlaySettings,
    updateOverlaySettings,
    musicStatus,
    playlists,
    isControlDisabled,
    seekBarRef,
    sendMusicControlCommand,
    handleSeek,
    formatTime,
    authStatus,
  } = context;

  const layout = useOverlayCardLayout({
    savedLayout: overlaySettings?.overlay_cards_layout,
    updateLayout: async (jsonValue) => {
      await updateOverlaySettings({ overlay_cards_layout: jsonValue });
    },
  });

  const rewardCount = useOverlayRewardCount({ overlaySettings });
  const lottery = useOverlayLottery({ isAuthenticated: Boolean(authStatus?.authenticated) });
  const { artworkUrl, setArtworkUrl } = useOverlayMusic({
    musicStatus,
    overlayMusicVolume: overlaySettings?.music_volume,
    setMusicStatus: context.setMusicStatus,
    setPlaylists: context.setPlaylists,
  });

  const renderCard = (cardKey: OverlayCardKey, column: ColumnKey, preview = false) => {
    switch (cardKey) {
      case 'musicPlayer':
        return (
          <MusicPlayerCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            musicStatus={musicStatus}
            artworkUrl={artworkUrl}
            setArtworkUrl={setArtworkUrl}
            isControlDisabled={isControlDisabled}
            sendMusicControlCommand={sendMusicControlCommand}
            seekBarRef={seekBarRef}
            handleSeek={handleSeek}
            formatTime={formatTime}
            setMusicStatus={context.setMusicStatus}
            updateOverlaySettings={updateOverlaySettings as any}
            playlists={playlists}
          />
        );
      case 'fax':
        return (
          <FaxCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            overlaySettings={overlaySettings}
            updateOverlaySettings={updateOverlaySettings as any}
          />
        );
      case 'clock':
        return (
          <ClockCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            overlaySettings={overlaySettings}
            updateOverlaySettings={updateOverlaySettings as any}
          />
        );
      case 'micTranscript':
        return (
          <MicTranscriptCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            overlaySettings={overlaySettings}
            updateOverlaySettings={updateOverlaySettings as any}
          />
        );
      case 'rewardCount':
        return (
          <RewardCountCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            overlaySettings={overlaySettings}
            updateOverlaySettings={updateOverlaySettings as any}
            rewardGroups={rewardCount.rewardGroups}
            rewardCounts={rewardCount.rewardCounts}
            fetchRewardCounts={rewardCount.fetchRewardCounts}
            resetAllConfirm={rewardCount.resetAllConfirm}
            setResetAllConfirm={rewardCount.setResetAllConfirm}
            deleteConfirmKey={rewardCount.deleteConfirmKey}
            setDeleteConfirmKey={rewardCount.setDeleteConfirmKey}
          />
        );
      case 'lottery':
        return (
          <LotteryCard
            column={column}
            focusCard={focusCard}
            draggingCard={layout.draggingCard}
            onDragStart={layout.handleDragStart}
            onDragEnd={layout.handleDragEnd}
            preview={preview}
            overlaySettings={overlaySettings}
            updateOverlaySettings={updateOverlaySettings as any}
            lottery={lottery}
            isAuthenticated={Boolean(authStatus?.authenticated)}
          />
        );
      default:
        return null;
    }
  };

  const renderDropZone = (column: ColumnKey, index: number) => {
    const isActive =
      !!layout.draggingCard
      && layout.dragOverPosition?.column === column
      && layout.dragOverPosition?.index === index;
    const isLastPosition = index === layout.cardsLayout[column].length;

    const baseClass = layout.draggingCard ? 'h-2' : 'h-0';
    const spacingClass = isActive ? (isLastPosition ? 'mt-4' : 'mb-4') : '';
    const activeClass = isActive ? `h-auto ${spacingClass}` : '';

    return (
      <div
        className={`${baseClass} ${activeClass} rounded-md transition-all duration-150`}
        onDragOver={layout.handleDragOverZone(column, index)}
        onDrop={layout.handleDropOnCard(column, index)}
      >
        {isActive && layout.draggingCard ? renderCard(layout.draggingCard, column, true) : null}
      </div>
    );
  };

  if (focusCard) {
    return (
      <div className="space-y-4 [&:focus]:outline-none [&:focus-visible]:outline-none">
        {renderCard(focusCard, 'left')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [&:focus]:outline-none [&:focus-visible]:outline-none">
      {(['left', 'right'] as ColumnKey[]).map((column) => (
        <div
          key={column}
          className="flex flex-col min-h-[60px]"
          onDragOver={layout.handleDragOver}
          onDrop={layout.handleDropOnColumn(column)}
        >
          {layout.cardsLayout[column].map((cardKey, index) => (
            <div
              key={cardKey}
              className={index < layout.cardsLayout[column].length - 1 ? 'mb-4' : ''}
            >
              {renderDropZone(column, index)}
              {renderCard(cardKey, column)}
            </div>
          ))}
          {renderDropZone(column, layout.cardsLayout[column].length)}
        </div>
      ))}
    </div>
  );
};
