import { useEffect, useRef, useState, type DragEvent } from 'react';

import type { CardsLayout, ColumnKey, OverlayCardKey } from './types';
import { normalizeCardsLayout, parseCardsLayout, isCardKey } from './types';

interface UseOverlayCardLayoutParams {
  savedLayout?: string;
  updateLayout: (jsonValue: string) => Promise<void>;
}

export const useOverlayCardLayout = ({
  savedLayout,
  updateLayout,
}: UseOverlayCardLayoutParams) => {
  const [cardsLayout, setCardsLayout] = useState<CardsLayout>(() => parseCardsLayout(savedLayout));
  const [draggingCard, setDraggingCard] = useState<OverlayCardKey | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<{ column: ColumnKey; index: number } | null>(null);

  const isLayoutInitialMount = useRef(true);
  const previousLayoutSavedState = useRef<string | undefined>(undefined);
  const previousLayoutState = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!savedLayout || savedLayout === previousLayoutSavedState.current) {
      return;
    }

    const parsedLayout = parseCardsLayout(savedLayout);
    setCardsLayout(parsedLayout);
    previousLayoutSavedState.current = savedLayout;
    previousLayoutState.current = JSON.stringify(parsedLayout);
  }, [savedLayout]);

  useEffect(() => {
    if (isLayoutInitialMount.current) {
      isLayoutInitialMount.current = false;
      return;
    }

    const normalized = normalizeCardsLayout(cardsLayout);
    const jsonValue = JSON.stringify(normalized);

    if (jsonValue === previousLayoutState.current) {
      return;
    }

    const saveLayoutState = async () => {
      try {
        previousLayoutSavedState.current = jsonValue;
        previousLayoutState.current = jsonValue;
        await updateLayout(jsonValue);
      } catch (error) {
        console.error('[OverlaySettings] Failed to save card layout:', error);
      }
    };

    saveLayoutState();
  }, [cardsLayout, updateLayout]);

  const getCardKeyFromDragEvent = (event: DragEvent): OverlayCardKey | null => {
    const rawKey = event.dataTransfer.getData('text/plain');
    if (rawKey && isCardKey(rawKey)) {
      return rawKey;
    }
    return null;
  };

  const moveCard = (cardKey: OverlayCardKey, targetColumn: ColumnKey, targetIndex: number | null) => {
    setCardsLayout((prev) => {
      const sourceColumn: ColumnKey = prev.left.includes(cardKey) ? 'left' : 'right';
      const sourceIndex = sourceColumn === 'left' ? prev.left.indexOf(cardKey) : prev.right.indexOf(cardKey);

      const left = prev.left.filter((key) => key !== cardKey);
      const right = prev.right.filter((key) => key !== cardKey);

      let targetList = targetColumn === 'left' ? left : right;
      let insertIndex = targetIndex ?? targetList.length;

      if (sourceColumn === targetColumn && sourceIndex !== -1 && targetIndex !== null && targetIndex > sourceIndex) {
        insertIndex -= 1;
      }

      if (insertIndex < 0) insertIndex = 0;
      if (insertIndex > targetList.length) insertIndex = targetList.length;

      targetList = [
        ...targetList.slice(0, insertIndex),
        cardKey,
        ...targetList.slice(insertIndex),
      ];

      const nextLayout =
        targetColumn === 'left'
          ? { left: targetList, right }
          : { left, right: targetList };

      return normalizeCardsLayout(nextLayout);
    });
  };

  const handleDragStart = (cardKey: OverlayCardKey, column: ColumnKey) => (event: DragEvent) => {
    event.dataTransfer.setData('text/plain', cardKey);
    event.dataTransfer.setData('application/x-card-column', column);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingCard(cardKey);
  };

  const handleDragEnd = () => {
    setDraggingCard(null);
    setDragOverPosition(null);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnColumn = (column: ColumnKey) => (event: DragEvent) => {
    event.preventDefault();
    const cardKey = getCardKeyFromDragEvent(event);
    if (!cardKey) return;
    moveCard(cardKey, column, null);
    setDragOverPosition(null);
  };

  const handleDropOnCard = (column: ColumnKey, index: number) => (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const cardKey = getCardKeyFromDragEvent(event);
    if (!cardKey) return;
    moveCard(cardKey, column, index);
    setDragOverPosition(null);
  };

  const handleDragOverZone = (column: ColumnKey, index: number) => (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverPosition({ column, index });
  };

  return {
    cardsLayout,
    draggingCard,
    dragOverPosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDropOnColumn,
    handleDropOnCard,
    handleDragOverZone,
  };
};
