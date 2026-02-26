import { useEffect } from 'react';
import { useMusicPlayerContext } from '../../contexts/MusicPlayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import TypewriterText from '../TypewriterText';
import MusicArtwork from './MusicArtwork';
import MusicProgress from './MusicProgress';
import { useArtworkRotation } from './player/useArtworkRotation';
import { useDebugPanel } from './player/useDebugPanel';
import { useMusicStatusReporter } from './player/useMusicStatusReporter';
import type { MusicPlayerViewModel } from './player/types';
import { useTrackDisplayState } from './player/useTrackDisplayState';

interface MusicPlayerProps {
  playlist?: string | undefined;
}

const MusicPlayer = ({ playlist: propPlaylist }: MusicPlayerProps) => {
  const player = useMusicPlayerContext();
  const { settings } = useSettings();

  const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  const playlist = propPlaylist ?? settings?.music_playlist ?? undefined;

  const debugPanel = useDebugPanel();
  const displayState = useTrackDisplayState({
    currentTrack: player.currentTrack,
    playbackStatus: player.playbackStatus,
    isPlaying: player.isPlaying,
    currentTime: player.currentTime,
    duration: player.duration,
  });
  const rotation = useArtworkRotation({
    isPlaying: player.isPlaying,
    isTrackEnding: displayState.isTrackEnding,
  });

  useMusicStatusReporter(player as MusicPlayerViewModel);

  useEffect(() => {
    if (playlist) {
      player.loadPlaylist(playlist);
      return;
    }

    player.loadPlaylist(undefined);
  }, []);

  useEffect(() => {
    if (playlist !== undefined) {
      player.loadPlaylist(playlist);
    }
  }, [playlist]);

  return (
    <>
      {isDebug && (
        <div
          onMouseDown={debugPanel.handleMouseDown}
          style={{
            position: 'fixed',
            top: `${debugPanel.position.y}px`,
            left: `${debugPanel.position.x}px`,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            border: '2px solid #10b981',
            cursor: debugPanel.isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            opacity: debugPanel.isDragging ? 0.8 : 1,
            transition: debugPanel.isDragging ? 'none' : 'opacity 0.2s',
          }}
        >
          <div>
            Status: {player.playbackStatus === 'playing' ? '▶️' : player.playbackStatus === 'paused' ? '⏸️' : '⏹️'}
          </div>
          <div>Track: {player.currentTrack?.title || 'None'}</div>
          <div>Volume: {player.volume}%</div>
        </div>
      )}

      {displayState.playerPosition === 'visible' && (
        <MusicProgress progress={player.progress} isPlaying={player.isPlaying} />
      )}

      {displayState.displayTrack ? (
        <div
          className={`${displayState.animationState === 'entering' ? 'music-info-entering' : displayState.animationState === 'exiting' ? 'music-info-exiting' : ''} ${displayState.playerPosition === 'hidden' ? 'music-player-hidden' : displayState.playerPosition === 'entering' ? 'music-player-entering' : ''}`}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <MusicArtwork
            track={displayState.displayTrack}
            isPlaying={player.isPlaying}
            onPlayPause={() => (player.isPlaying ? player.pause() : player.play())}
            audioElement={player.audioElement}
            rotation={rotation}
          />

          <div
            className='text-outline'
            style={{
              position: 'relative',
              bottom: '28px',
              left: '40px',
              zIndex: 99,
              color: 'white',
              fontSize: '24px',
            }}
          >
            <div style={{ fontWeight: 'bold', minHeight: '24px' }}>
              {displayState.showTypewriter ? (
                <TypewriterText text={displayState.displayTrack.title} speed={50} delay={100} />
              ) : (
                displayState.displayTrack.title
              )}
            </div>
            <div style={{ fontSize: '10px', marginTop: '10px', minHeight: '12px' }}>
              {displayState.showTypewriter ? (
                <TypewriterText
                  text={displayState.displayTrack.artist}
                  speed={50}
                  delay={100 + displayState.displayTrack.title.length * 50}
                />
              ) : (
                displayState.displayTrack.artist || '\u00A0'
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default MusicPlayer;
