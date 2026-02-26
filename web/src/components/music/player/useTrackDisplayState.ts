import { useEffect, useRef, useState } from 'react';
import type { Track } from '@shared/types/music';

interface UseTrackDisplayStateParams {
  currentTrack: Track | null;
  playbackStatus: 'playing' | 'paused' | 'stopped';
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export const useTrackDisplayState = ({
  currentTrack,
  playbackStatus,
  isPlaying,
  currentTime,
  duration,
}: UseTrackDisplayStateParams) => {
  const [animationState, setAnimationState] = useState<'entering' | 'idle' | 'exiting'>('idle');
  const [displayTrack, setDisplayTrack] = useState<Track | null>(null);
  const [showTypewriter, setShowTypewriter] = useState(false);
  const [isTrackEnding, setIsTrackEnding] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<'visible' | 'hidden' | 'entering'>('hidden');
  const prevTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (playbackStatus === 'stopped') {
      setPlayerPosition('hidden');
      return;
    }

    if (playerPosition === 'hidden') {
      setPlayerPosition('entering');
      const timer = setTimeout(() => {
        setPlayerPosition('visible');
      }, 700);

      return () => clearTimeout(timer);
    }

    setPlayerPosition('visible');
  }, [playbackStatus]);

  useEffect(() => {
    if (!displayTrack && currentTrack) {
      setDisplayTrack(currentTrack);
      prevTrackIdRef.current = currentTrack.id;
    }

    if (currentTrack && currentTrack.id !== prevTrackIdRef.current) {
      setIsTrackEnding(false);
      if (prevTrackIdRef.current !== null) {
        setAnimationState('exiting');
        setShowTypewriter(false);
        setTimeout(() => {
          setDisplayTrack(currentTrack);
          setAnimationState('entering');
          setShowTypewriter(true);
          setTimeout(() => {
            setAnimationState('idle');
          }, 600);
        }, 400);
      } else {
        setDisplayTrack(currentTrack);
        setAnimationState('entering');
        setShowTypewriter(true);
        setTimeout(() => {
          setAnimationState('idle');
        }, 600);
      }

      prevTrackIdRef.current = currentTrack.id;
      return;
    }

    if (!currentTrack && prevTrackIdRef.current !== null && playbackStatus !== 'stopped') {
      setAnimationState('exiting');
      setShowTypewriter(false);
      setTimeout(() => {
        setDisplayTrack(null);
        setAnimationState('idle');
      }, 400);
      prevTrackIdRef.current = null;
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if (duration > 0 && currentTime > 0) {
      const remainingTime = duration - currentTime;
      if (remainingTime <= 3.0 && isPlaying && !isTrackEnding) {
        setIsTrackEnding(true);
      }
    }
  }, [currentTime, duration, isPlaying, isTrackEnding]);

  return {
    animationState,
    displayTrack,
    showTypewriter,
    isTrackEnding,
    playerPosition,
  };
};
