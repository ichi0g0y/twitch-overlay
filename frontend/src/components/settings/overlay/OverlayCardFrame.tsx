import React from 'react';

import { CollapsibleCard } from '../../ui/collapsible-card';
import type { ColumnKey, OverlayCardKey } from './types';

interface OverlayCardFrameProps {
  panelId: string;
  cardKey: OverlayCardKey;
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  preview?: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
}

export const OverlayCardFrame: React.FC<OverlayCardFrameProps> = ({
  panelId,
  cardKey,
  column,
  focusCard,
  draggingCard,
  preview = false,
  title,
  description,
  children,
  contentClassName = 'space-y-4 text-left',
  onDragStart,
  onDragEnd,
}) => {
  const isDraggingSelf = draggingCard === cardKey;
  const canSort = !focusCard && !preview;
  const cardClassName = `break-inside-avoid${preview ? ' opacity-60 pointer-events-none ring-2 ring-blue-400/60 shadow-lg' : ''}${!preview && isDraggingSelf ? ' opacity-30 scale-[0.98]' : ''}`;
  const headerClassName = canSort ? 'cursor-grab active:cursor-grabbing' : undefined;

  return (
    <CollapsibleCard
      panelId={panelId}
      title={title}
      description={description}
      className={cardClassName}
      headerClassName={headerClassName}
      headerProps={canSort ? {
        draggable: true,
        onDragStart: onDragStart(cardKey, column),
        onDragEnd,
      } : undefined}
      contentClassName={contentClassName}
    >
      {children}
    </CollapsibleCard>
  );
};
