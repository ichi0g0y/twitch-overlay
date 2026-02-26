import React from 'react';
import { Globe2, LockOpen, Sparkles } from 'lucide-react';
import type { RenderGroup } from './types';

export const GroupNavAvatar: React.FC<{ group: RenderGroup }> = ({ group }) => {
  if (group.channelAvatarUrl) {
    return (
      <img
        src={group.channelAvatarUrl}
        alt={`${group.label} avatar`}
        className="h-full w-full rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  if (group.source === 'unlocked') return <LockOpen className="h-3.5 w-3.5" />;
  if (group.source === 'global') return <Globe2 className="h-3.5 w-3.5" />;
  if (group.source === 'special') return <Sparkles className="h-3.5 w-3.5" />;
  return (
    <span className="text-[10px] font-semibold leading-none">
      {(group.label || '?').slice(0, 1).toUpperCase()}
    </span>
  );
};
