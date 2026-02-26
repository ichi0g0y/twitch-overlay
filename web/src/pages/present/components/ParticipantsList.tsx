import React, { useState } from 'react';
import type { PresentParticipant } from '../../../types';
import { buildApiUrl } from '../../../utils/api';
import { calculateParticipantTickets } from '../utils/ticketCalculator';
import { ParticipantListItem } from './participants/ParticipantListItem';

interface ParticipantsListProps {
  participants: PresentParticipant[];
  winner: PresentParticipant | null;
  baseTicketsLimit: number;
  finalTicketsLimit: number;
  debugMode?: boolean;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  winner,
  baseTicketsLimit,
  finalTicketsLimit,
  debugMode = false,
}) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PresentParticipant>>({});

  const totalEntries = participants.reduce((sum, participant) => {
    const { finalTickets } = calculateParticipantTickets(participant, {
      baseTicketsLimit,
      finalTicketsLimit,
    });

    return sum + finalTickets;
  }, 0);

  const handleAddTestParticipant = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/present/test'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to add test participant');
      }
    } catch (error) {
      console.error('Error adding test participant:', error);
      alert('テスト参加者の追加に失敗しました');
    }
  };

  const handleDeleteParticipant = async (userId: string) => {
    if (!confirm('この参加者を削除しますか？')) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/present/participants/${userId}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete participant');
      }
    } catch (error) {
      console.error('Error deleting participant:', error);
      alert('参加者の削除に失敗しました');
    }
  };

  const handleStartEdit = (participant: PresentParticipant) => {
    setEditingUserId(participant.user_id);
    setEditForm({
      entry_count: participant.entry_count,
      is_subscriber: participant.is_subscriber,
      subscriber_tier: participant.subscriber_tier,
    });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditForm({});
  };

  const handleSaveEdit = async (userId: string) => {
    const normalizedEditForm: Partial<PresentParticipant> = {
      ...editForm,
    };

    if (normalizedEditForm.is_subscriber && !normalizedEditForm.subscriber_tier) {
      normalizedEditForm.subscriber_tier = '1000';
    }

    try {
      const response = await fetch(buildApiUrl(`/api/present/participants/${userId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedEditForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update participant');
      }

      setEditingUserId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating participant:', error);
      alert('参加者の更新に失敗しました');
    }
  };

  const handleEditFormChange = (updates: Partial<PresentParticipant>) => {
    setEditForm((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  return (
    <div className='bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl h-full flex flex-col'>
      <h2 className='text-2xl font-bold mb-4 flex items-center gap-2'>
        <span>👥</span>
        <span>参加者一覧</span>
        <span className='ml-auto text-xl bg-purple-600 px-3 py-1 rounded-full'>{participants.length}</span>
        {debugMode && (
          <button
            onClick={handleAddTestParticipant}
            className='ml-2 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors'
            title='テスト参加者を追加'
          >
            +
          </button>
        )}
      </h2>

      <div className='text-sm text-purple-200 mb-3'>
        総口数: <span className='font-bold text-yellow-300'>{totalEntries}口</span>
      </div>

      {participants.length === 0 ? (
        <div className='text-center py-12 text-purple-300 flex-1 flex flex-col items-center justify-center'>
          <div className='text-6xl mb-4'>🎫</div>
          <p className='text-lg'>まだ参加者がいません</p>
          <p className='text-sm mt-2'>リワードを使用すると参加できます</p>
        </div>
      ) : (
        <div className='space-y-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-purple-900'>
          {participants.map((participant, index) => (
            <ParticipantListItem
              key={participant.user_id}
              participant={participant}
              index={index}
              isWinner={winner?.user_id === participant.user_id}
              debugMode={debugMode}
              baseTicketsLimit={baseTicketsLimit}
              finalTicketsLimit={finalTicketsLimit}
              totalEntries={totalEntries}
              isEditing={editingUserId === participant.user_id}
              editForm={editForm}
              onEditFormChange={handleEditFormChange}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onDeleteParticipant={handleDeleteParticipant}
            />
          ))}
        </div>
      )}
    </div>
  );
};
