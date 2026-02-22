import React from 'react';
import MusicManagerEmbed from '../music/MusicManagerEmbed';
import { CollapsibleCard } from '../ui/collapsible-card';

export const MusicSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <CollapsibleCard
        panelId="settings.music.manager"
        title="音楽管理"
        description="配信中の音楽を管理します。URLパラメータ ?playlist=プレイリスト名 で特定のプレイリストを再生できます。"
      >
          <MusicManagerEmbed />
      </CollapsibleCard>
    </div>
  );
};
