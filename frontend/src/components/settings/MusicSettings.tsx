import React from 'react';
import MusicManagerEmbed from '../music/MusicManagerEmbed';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export const MusicSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>音楽管理</CardTitle>
          <CardDescription>
            配信中の音楽を管理します。URLパラメータ ?playlist=プレイリスト名 で特定のプレイリストを再生できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MusicManagerEmbed />
        </CardContent>
      </Card>
    </div>
  );
};