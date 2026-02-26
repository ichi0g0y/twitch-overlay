import { useEffect } from 'react';
import { buildApiUrl } from '../../../utils/api';
import type { MusicPlayerViewModel } from './types';

export const useMusicStatusReporter = (player: MusicPlayerViewModel) => {
  useEffect(() => {
    const sendMusicStatus = async () => {
      try {
        const statusData = {
          playback_status: player.playbackStatus,
          is_playing: player.isPlaying,
          current_track: player.currentTrack,
          progress: player.progress,
          current_time: player.currentTime,
          duration: player.duration,
          volume: player.volume,
          playlist_name: player.playlistName,
        };

        await fetch(buildApiUrl('/api/music/status/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statusData),
        });
      } catch {
        // noop
      }
    };

    sendMusicStatus();

    let interval: NodeJS.Timeout | null = null;
    if (player.isPlaying) {
      interval = setInterval(sendMusicStatus, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [
    player.playbackStatus,
    player.isPlaying,
    player.currentTrack?.id,
    player.volume,
    player.playlistName,
    Math.floor(player.currentTime || 0),
  ]);
};
