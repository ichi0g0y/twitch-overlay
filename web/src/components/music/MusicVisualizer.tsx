import { useEffect, useRef, useState } from 'react';
import { extractDominantColor } from './visualizer/color';
import {
  BAR_COUNT,
  DEFAULT_COLOR,
  DOT_GAP,
  DOT_LEVELS,
  DOT_SIZE,
  OPACITY_LEVELS,
  RADIUS,
  THRESHOLD_HIGH,
  THRESHOLD_LOW,
  THRESHOLD_MID,
  type RgbColor,
} from './visualizer/constants';

interface MusicVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  artworkUrl?: string | undefined;
}

const MusicVisualizer = ({ audioElement, isPlaying, artworkUrl }: MusicVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const isConnectedRef = useRef(false);
  const lastAudioElementRef = useRef<HTMLAudioElement | null>(null);

  const [baseColor, setBaseColor] = useState<RgbColor>(DEFAULT_COLOR);

  useEffect(() => {
    if (artworkUrl) {
      extractDominantColor(artworkUrl).then((color) => {
        setBaseColor(color);
      });
      return;
    }

    setBaseColor(DEFAULT_COLOR);
  }, [artworkUrl]);

  useEffect(() => {
    if (!audioElement || !canvasRef.current) {
      return;
    }

    if (audioElement.src === '' || audioElement.src === window.location.href) {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // noop
        }

        sourceRef.current = null;
      }

      isConnectedRef.current = false;
      lastAudioElementRef.current = null;
      return;
    }

    if (!isConnectedRef.current || (audioElement !== lastAudioElementRef.current && audioElement)) {
      if (!audioContextRef.current) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.85;
        analyser.minDecibels = -100;
        analyser.maxDecibels = -30;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);
      }

      try {
        if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch {
            // noop
          }

          sourceRef.current = null;
        }

        const source = audioContextRef.current!.createMediaElementSource(audioElement);
        source.connect(analyserRef.current!);
        analyserRef.current!.connect(audioContextRef.current!.destination);
        sourceRef.current = source;
        isConnectedRef.current = true;
        lastAudioElementRef.current = audioElement;
      } catch (error) {
        if ((error as Error).message?.includes('already connected')) {
          isConnectedRef.current = true;
          lastAudioElementRef.current = audioElement;
        } else {
          console.error('Failed to connect audio source:', error);
          isConnectedRef.current = false;
        }
      }
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = 140;
    canvas.height = 140;

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) {
        return;
      }

      // @ts-ignore - ArrayBufferLike strict mismatch
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.imageSmoothingEnabled = false;

      for (let i = 0; i < BAR_COUNT; i++) {
        const dataIndex = Math.min(
          Math.floor((i * dataArrayRef.current.length) / BAR_COUNT / 3),
          dataArrayRef.current.length - 1
        );
        const value = dataArrayRef.current[dataIndex] || 0;
        const normalizedValue = Math.pow(value / 255, 0.7);

        let level = 0;
        if (normalizedValue > THRESHOLD_HIGH) {
          level = DOT_LEVELS;
        } else if (normalizedValue > THRESHOLD_MID) {
          level = 2;
        } else if (normalizedValue > THRESHOLD_LOW) {
          level = 1;
        }

        const angle = (i / BAR_COUNT) * Math.PI * 2;
        for (let j = 0; j < level; j++) {
          const distance = RADIUS + j * (DOT_SIZE + DOT_GAP) * 0.9;
          const dotX = centerX + Math.cos(angle) * distance;
          const dotY = centerY + Math.sin(angle) * distance;
          const x = Math.floor(dotX - DOT_SIZE / 2);
          const y = Math.floor(dotY - DOT_SIZE / 2);
          const opacity = OPACITY_LEVELS[j] || OPACITY_LEVELS[OPACITY_LEVELS.length - 1];

          ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`;
          ctx.fillRect(x, y, DOT_SIZE, DOT_SIZE);
        }
      }

      if (isPlaying) {
        animationIdRef.current = requestAnimationFrame(draw);
      }
    };

    if (isPlaying) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      draw();
    } else {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [audioElement, isPlaying, baseColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        imageRendering: 'pixelated',
      }}
    />
  );
};

export default MusicVisualizer;
