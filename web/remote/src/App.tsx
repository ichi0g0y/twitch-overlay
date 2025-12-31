import React, { useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Toaster } from 'sonner';
import { RemoteProvider, useRemote } from './contexts/RemoteContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import { SortableCard } from './components/SortableCard';
import { MusicController } from './components/music/MusicController';
import { FaxSettings } from './components/fax/FaxSettings';
import { ClockSettings } from './components/clock/ClockSettings';
import { RewardCountSettings } from './components/reward/RewardCountSettings';
import { LotterySettings } from './components/lottery/LotterySettings';

type CardId = 'music' | 'fax' | 'clock' | 'reward' | 'lottery';

interface CardExpandedState {
  [key: string]: boolean;
}

const RemoteControlContent: React.FC = () => {
  const { isConnected } = useRemote();

  // カードの並び順をLocalStorageで管理
  const [cardOrder, setCardOrder] = useLocalStorage<CardId[]>('remote-card-order', [
    'music',
    'fax',
    'clock',
    'reward',
    'lottery'
  ]);

  // カードの開閉状態をLocalStorageで管理
  const [expandedState, setExpandedState] = useLocalStorage<CardExpandedState>('remote-card-expanded', {
    music: true,
    fax: true,
    clock: true,
    reward: true,
    lottery: true
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id as CardId);
        const newIndex = items.indexOf(over.id as CardId);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleCard = (cardId: CardId) => {
    setExpandedState((prev) => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // カードコンポーネントのマッピング
  const cardComponents: Record<CardId, React.ReactNode> = {
    music: <MusicController isExpanded={expandedState.music} onToggle={() => toggleCard('music')} />,
    fax: <FaxSettings isExpanded={expandedState.fax} onToggle={() => toggleCard('fax')} />,
    clock: <ClockSettings isExpanded={expandedState.clock} onToggle={() => toggleCard('clock')} />,
    reward: <RewardCountSettings isExpanded={expandedState.reward} onToggle={() => toggleCard('reward')} />,
    lottery: <LotterySettings isExpanded={expandedState.lottery} onToggle={() => toggleCard('lottery')} />
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Remote Control
          </h1>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isConnected ? '接続中' : '切断'}
            </span>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cardOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {cardOrder.map((cardId) => (
                <SortableCard key={cardId} id={cardId}>
                  {cardComponents[cardId]}
                </SortableCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <RemoteProvider>
      <RemoteControlContent />
      <Toaster position="bottom-right" />
    </RemoteProvider>
  );
};

export default App;
