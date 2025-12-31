import React, { useState, useRef, useEffect } from 'react';
import { useRemote } from '../../contexts/RemoteContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Music,
  ChevronUp,
  ChevronDown,
  SkipBack,
  Pause,
  Play,
  SkipForward,
  Square,
  Volume2
} from 'lucide-react';
import { buildApiUrl } from '../../utils/api';

interface MusicControllerProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const MusicController: React.FC<MusicControllerProps> = ({ isExpanded, onToggle }) => {
  const { musicStatus, sendMusicCommand, updateOverlaySettings, playlists } = useRemote();
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [isControlDisabled, setIsControlDisabled] = useState(false);
  const seekBarRef = useRef<HTMLInputElement>(null);

  // アートワークURLの更新
  useEffect(() => {
    if (musicStatus.current_track?.artwork_path) {
      setArtworkUrl(buildApiUrl(`/music/artwork/${musicStatus.current_track.id}`));
    } else {
      setArtworkUrl(null);
    }
  }, [musicStatus.current_track]);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sendMusicControlCommand = async (command: string, data?: any) => {
    setIsControlDisabled(true);
    try {
      await sendMusicCommand(command, data);
    } catch (error) {
      console.error('Failed to send music command:', error);
    } finally {
      setTimeout(() => setIsControlDisabled(false), 500);
    }
  };

  const handleSeek = (position: number) => {
    sendMusicControlCommand('seek', { position });
  };

  return (
    <Card className="break-inside-avoid mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle>再生コントロール</CardTitle>
            <CardDescription>
              オーバーレイの音楽プレイヤーをリモート操作します
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* 現在の曲情報 */}
          {musicStatus.current_track ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                {/* アートワーク */}
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

                {/* 曲情報 */}
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

          {/* コントロールボタン */}
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

          {/* シークバー */}
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
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb ${(musicStatus.current_time / (musicStatus.duration || 1)) * 100}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatTime(musicStatus.current_time)}</span>
                <span>進捗: {((musicStatus.current_time / (musicStatus.duration || 1)) * 100).toFixed(1)}%</span>
                <span>{formatTime(musicStatus.duration)}</span>
              </div>
            </div>
          )}

          {/* ボリューム */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-500" />
            <input
              type="range"
              min="0"
              max="100"
              value={musicStatus.volume}
              onChange={(e) => {
                const volume = Number(e.target.value);
                // コマンドを送信
                sendMusicControlCommand('volume', { volume });
                // 設定にも保存
                updateOverlaySettings({ music_volume: volume });
              }}
              className="flex-1"
            />
            <span className="text-sm text-gray-500 w-10 text-right">
              {musicStatus.volume}%
            </span>
          </div>

          {/* プレイリスト選択 */}
          <div className="space-y-2">
            <Label htmlFor="playlist-select">プレイリスト</Label>
            <Select
              value={musicStatus.playlist_name || 'all'}
              onValueChange={async (value) => {
                // プレイリストを読み込み
                await sendMusicControlCommand('load', { playlist: value === 'all' ? undefined : value });

                // プレイリスト選択を永続化
                try {
                  const url = buildApiUrl('/api/music/state/update');
                  await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      track_id: musicStatus.current_track?.id || '',
                      playlist_name: value === 'all' ? null : value,
                      position: 0,
                      duration: 0,
                      playback_status: 'stopped',
                      is_playing: false,
                      volume: musicStatus.volume
                    })
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
                {playlists.map(playlist => (
                  <SelectItem key={playlist.id} value={playlist.name}>
                    {playlist.name} ({playlist.track_count}曲)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
