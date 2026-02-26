import React from 'react';
import { Lock, Star } from 'lucide-react';
import { getEmoteFavoriteKey, getEmoteUnavailableLabel } from './storage';
import type { Emote } from './types';

export const EmoteCell: React.FC<{
  emote: Emote;
  cellKey: string;
  favoriteKeySet: Set<string>;
  onSelect: (name: string, url: string) => void;
  onToggleFavorite: (emote: Emote) => void;
  showFavoriteToggle?: boolean;
}> = ({ emote, cellKey, favoriteKeySet, onSelect, onToggleFavorite, showFavoriteToggle = true }) => {
  const favoriteKey = getEmoteFavoriteKey(emote);
  const isFavorite = favoriteKeySet.has(favoriteKey);
  const canToggleFavorite = emote.usable && showFavoriteToggle;

  return (
    <div key={cellKey} className="group/emote relative inline-flex h-8 w-8 items-center justify-center">
      <button
        type="button"
        disabled={!emote.usable}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          if (!emote.usable) return;
          onSelect(emote.name, emote.url);
        }}
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded border ${
          emote.usable
            ? 'border-transparent hover:bg-white/80 dark:hover:bg-gray-800/70'
            : 'cursor-not-allowed border-transparent opacity-60'
        }`}
        title={emote.usable ? emote.name : getEmoteUnavailableLabel(emote)}
        aria-label={emote.usable ? emote.name : getEmoteUnavailableLabel(emote)}
      >
        <img src={emote.url} alt={emote.name} className="h-7 w-7 object-contain" loading="lazy" />
        {!emote.usable && (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center text-gray-500/80 dark:text-gray-300/70">
            <Lock className="h-2.5 w-2.5 fill-current opacity-80" />
          </span>
        )}
      </button>
      {canToggleFavorite && (
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(emote);
          }}
          className={`pointer-events-none absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center opacity-0 transition-all group-hover/emote:pointer-events-auto group-hover/emote:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 ${
            isFavorite
              ? 'text-amber-500 dark:text-amber-300'
              : 'text-gray-400 hover:text-amber-500 dark:text-gray-500 dark:hover:text-amber-300'
          }`}
          aria-label={isFavorite ? `${emote.name} をお気に入り解除` : `${emote.name} をお気に入り`}
          title={isFavorite ? 'お気に入り解除' : 'お気に入り'}
        >
          <Star className={`h-2.5 w-2.5 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      )}
    </div>
  );
};
