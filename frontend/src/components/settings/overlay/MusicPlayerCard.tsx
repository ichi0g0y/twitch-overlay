import { Music, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from 'lucide-react';
import React from 'react';

import { buildApiUrl } from '../../../utils/api';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface MusicPlayerCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  musicStatus: any;
  artworkUrl: string | null;
  setArtworkUrl: (value: string | null) => void;
  isControlDisabled: boolean;
  sendMusicControlCommand: (command: string, payload?: any) => Promise<void> | void;
  seekBarRef: React.RefObject<HTMLInputElement>;
  handleSeek: (value: number) => void;
  formatTime: (value: number) => string;
  setMusicStatus?: (value: any) => void;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
  playlists: Array<{ id: string; name: string; track_count: number }>;
}

export const MusicPlayerCard: React.FC<MusicPlayerCardProps> = ({
  column,
  focusCard,
  draggingCard,
  onDragStart,
  onDragEnd,
  preview,
  musicStatus,
  artworkUrl,
  setArtworkUrl,
  isControlDisabled,
  sendMusicControlCommand,
  seekBarRef,
  handleSeek,
  formatTime,
  setMusicStatus,
  updateOverlaySettings,
  playlists,
}) => {
  return (
    <OverlayCardFrame
      panelId="settings.overlay.music-player"
      cardKey="musicPlayer"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Music className="w-4 h-4" />
          再生コントロール
        </span>
      )}
      description="オーバーレイの音楽プレイヤーをリモート操作します"
    >
      {musicStatus.current_track ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0">
              {artworkUrl ? (
                <img
                  src={artworkUrl}
                  alt={musicStatus.current_track.title}
                  className="w-full h-full object-cover rounded"
                  onError={() => setArtworkUrl(null)}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                  <Music className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{musicStatus.current_track.title}</p>
              <p className="text-xs text-gray-500 truncate">
                {musicStatus.current_track.artist} • {formatTime(musicStatus.current_time)} / {formatTime(musicStatus.duration)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Music className="w-8 h-8 mx-auto mb-1 opacity-50" />
          <p className="text-sm">再生中の曲はありません</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-1">
        <Button
          onClick={() => sendMusicControlCommand('previous')}
          size="sm"
          variant="outline"
          disabled={!musicStatus.current_track || isControlDisabled}
          className="h-9 w-9"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          onClick={() => sendMusicControlCommand(musicStatus.is_playing ? 'pause' : 'play')}
          size="sm"
          className="h-9 w-9"
          disabled={isControlDisabled}
        >
          {musicStatus.is_playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </Button>

        <Button
          onClick={() => sendMusicControlCommand('next')}
          size="sm"
          variant="outline"
          disabled={!musicStatus.current_track || isControlDisabled}
          className="h-9 w-9"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          onClick={() => sendMusicControlCommand('stop')}
          size="sm"
          variant="outline"
          className="ml-2 h-9 w-9"
          disabled={!musicStatus.current_track}
          title="停止"
        >
          <Square className="w-3.5 h-3.5" />
        </Button>
      </div>

      {musicStatus.current_track && (
        <div className="space-y-2">
          <input
            ref={seekBarRef}
            type="range"
            min="0"
            max={musicStatus.duration || 100}
            value={musicStatus.current_time || 0}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="w-full"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(musicStatus.current_time)}</span>
            <span>進捗: {((musicStatus.current_time / (musicStatus.duration || 1)) * 100).toFixed(1)}%</span>
            <span>{formatTime(musicStatus.duration)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Volume2 className="w-4 h-4 text-gray-500" />
        <input
          type="range"
          min="0"
          max="100"
          value={musicStatus.volume}
          onChange={(e) => {
            const volume = Number(e.target.value);
            setMusicStatus?.((prev: any) => ({ ...prev, volume }));
            sendMusicControlCommand('volume', { volume });
            updateOverlaySettings({ music_volume: volume });
          }}
          className="flex-1"
        />
        <span className="text-sm text-gray-500 w-10 text-right">
          {musicStatus.volume}%
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="playlist-select">プレイリスト</Label>
        <Select
          value={musicStatus.playlist_name || 'all'}
          onValueChange={async (value) => {
            setMusicStatus?.((prev: any) => ({
              ...prev,
              playlist_name: value === 'all' ? undefined : value,
            }));

            await sendMusicControlCommand('load', { playlist: value === 'all' ? undefined : value });

            try {
              await fetch(buildApiUrl('/api/music/state/update'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  track_id: musicStatus.current_track?.id || '',
                  playlist_name: value === 'all' ? null : value,
                  position: 0,
                  duration: 0,
                  playback_status: 'stopped',
                  is_playing: false,
                  volume: musicStatus.volume,
                }),
              });
            } catch (error) {
              console.error('Failed to save playlist selection:', error);
            }
          }}
        >
          <SelectTrigger id="playlist-select">
            <SelectValue placeholder="すべての曲" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての曲</SelectItem>
            {playlists.map((playlist) => (
              <SelectItem key={playlist.id} value={playlist.name}>
                {playlist.name} ({playlist.track_count}曲)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </OverlayCardFrame>
  );
};
