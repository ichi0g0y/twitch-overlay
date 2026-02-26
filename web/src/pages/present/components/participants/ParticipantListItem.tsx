import React from 'react';
import { Edit2, Save, Trash2, X } from 'lucide-react';
import type { PresentParticipant } from '../../../../types';
import { calculateParticipantTickets } from '../../utils/ticketCalculator';
import { getTimeAgo } from './getTimeAgo';

interface ParticipantListItemProps {
  participant: PresentParticipant;
  index: number;
  isWinner: boolean;
  debugMode: boolean;
  baseTicketsLimit: number;
  finalTicketsLimit: number;
  totalEntries: number;
  isEditing: boolean;
  editForm: Partial<PresentParticipant>;
  onEditFormChange: (updates: Partial<PresentParticipant>) => void;
  onStartEdit: (participant: PresentParticipant) => void;
  onSaveEdit: (userId: string) => void;
  onCancelEdit: () => void;
  onDeleteParticipant: (userId: string) => void;
}

export const ParticipantListItem: React.FC<ParticipantListItemProps> = ({
  participant,
  index,
  isWinner,
  debugMode,
  baseTicketsLimit,
  finalTicketsLimit,
  totalEntries,
  isEditing,
  editForm,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteParticipant,
}) => {
  const redeemedAt = new Date(participant.redeemed_at);
  const timeAgo = getTimeAgo(redeemedAt);
  const { baseTickets, finalTickets, bonusTickets } = calculateParticipantTickets(participant, {
    baseTicketsLimit,
    finalTicketsLimit,
  });

  const winProbability = totalEntries > 0 ? ((finalTickets / totalEntries) * 100).toFixed(1) : '0.0';

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
        isWinner ? 'bg-yellow-500/30 border-2 border-yellow-400 scale-105' : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className='flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold'>
        {index + 1}
      </div>

      {participant.avatar_url ? (
        <img
          src={participant.avatar_url}
          alt={participant.display_name}
          className='w-10 h-10 rounded-full border-2 border-purple-400'
        />
      ) : (
        <div className='w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-xl'>
          👤
        </div>
      )}

      <div className='flex-1 min-w-0'>
        {isEditing ? (
          <div className='space-y-2'>
            <div className='font-semibold'>{participant.display_name || participant.username}さん</div>
            <div className='grid grid-cols-2 gap-2 text-xs'>
              <label className='flex items-center gap-1'>
                口数:
                <input
                  type='number'
                  min='1'
                  max={String(baseTicketsLimit)}
                  value={editForm.entry_count || 1}
                  onChange={(e) =>
                    onEditFormChange({ entry_count: Number.parseInt(e.target.value, 10) || 1 })
                  }
                  className='w-16 px-1 py-0.5 bg-black/30 rounded'
                />
              </label>
              <label className='flex items-center gap-1'>
                <input
                  type='checkbox'
                  checked={editForm.is_subscriber || false}
                  onChange={(e) => onEditFormChange({ is_subscriber: e.target.checked })}
                />
                サブスク
              </label>
              {editForm.is_subscriber && (
                <label className='flex items-center gap-1'>
                  Tier:
                  <select
                    value={editForm.subscriber_tier || '1000'}
                    onChange={(e) => onEditFormChange({ subscriber_tier: e.target.value })}
                    className='px-1 py-0.5 bg-black/30 rounded'
                  >
                    <option value='1000'>1</option>
                    <option value='2000'>2</option>
                    <option value='3000'>3</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className='font-semibold truncate flex items-center gap-2'>
              {participant.display_name || participant.username}さん
              {isWinner && <span className='text-yellow-400'>👑</span>}
            </div>
            <div className='text-xs text-purple-300 flex items-center gap-2 mt-1'>
              {participant.is_subscriber && (
                <>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      participant.subscriber_tier === '3000'
                        ? 'bg-purple-600 text-white'
                        : participant.subscriber_tier === '2000'
                          ? 'bg-pink-600 text-white'
                          : 'bg-blue-600 text-white'
                    }`}
                  >
                    Tier {participant.subscriber_tier === '3000' ? '3' : participant.subscriber_tier === '2000' ? '2' : '1'}
                  </span>
                  <span>•</span>
                </>
              )}
              <span>{timeAgo}</span>
            </div>
            <div className='text-xs text-yellow-300 font-bold mt-1'>
              🎫 {baseTickets}口
              {bonusTickets > 0 && <span className='text-pink-300'> +{bonusTickets}ボーナス</span>} • 確率 {winProbability}%
            </div>
          </>
        )}
      </div>

      {debugMode && (
        <div className='flex flex-col gap-1'>
          {isEditing ? (
            <>
              <button
                onClick={() => onSaveEdit(participant.user_id)}
                className='p-2 bg-green-600 hover:bg-green-700 rounded transition-colors'
                title='保存'
              >
                <Save size={16} />
              </button>
              <button
                onClick={onCancelEdit}
                className='p-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors'
                title='キャンセル'
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onStartEdit(participant)}
                className='p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors'
                title='編集'
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => onDeleteParticipant(participant.user_id)}
                className='p-2 bg-red-600 hover:bg-red-700 rounded transition-colors'
                title='削除'
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
