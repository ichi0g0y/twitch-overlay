import { useEffect, useRef, useState } from 'react';

interface UseArtworkRotationParams {
  isPlaying: boolean;
  isTrackEnding: boolean;
}

export const useArtworkRotation = ({ isPlaying, isTrackEnding }: UseArtworkRotationParams) => {
  const rotationRef = useRef(0);
  const [rotation, setRotation] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const rotationSpeedRef = useRef(1);
  const decelerationStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let lastTime = performance.now();
    const DECELERATION_DURATION = 3000;

    const updateRotation = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;

      if (isPlaying && !isTrackEnding) {
        rotationSpeedRef.current = 1;
        decelerationStartTimeRef.current = null;
      } else if (isTrackEnding && rotationSpeedRef.current > 0) {
        if (decelerationStartTimeRef.current === null) {
          decelerationStartTimeRef.current = currentTime;
        }

        const elapsedTime = currentTime - decelerationStartTimeRef.current;
        if (elapsedTime < DECELERATION_DURATION) {
          const progress = elapsedTime / DECELERATION_DURATION;
          rotationSpeedRef.current = 1 - Math.pow(progress, 3);
        } else {
          rotationSpeedRef.current = 0;
        }
      } else if (!isPlaying && !isTrackEnding) {
        rotationSpeedRef.current = 0;
        decelerationStartTimeRef.current = null;
      }

      if (rotationSpeedRef.current > 0) {
        const degreesPerMs = 360 / 20000;
        rotationRef.current = (rotationRef.current + deltaTime * degreesPerMs * rotationSpeedRef.current) % 360;
        setRotation(rotationRef.current);
      }

      lastTime = currentTime;
      animationFrameRef.current = requestAnimationFrame(updateRotation);
    };

    animationFrameRef.current = requestAnimationFrame(updateRotation);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isTrackEnding]);

  return rotation;
};
