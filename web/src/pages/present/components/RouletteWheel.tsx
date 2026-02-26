import React, { useEffect, useRef, useState } from 'react';
import type { PresentParticipant } from '../../../types';
import { playFanfareSound, playTickSound } from '../../../utils/sound';
import { RouletteDisplay } from './roulette/RouletteDisplay';
import { drawRouletteWheel } from './roulette/drawing';
import type { ParticipantSegment } from './roulette/types';
import { findSegmentByArrow, findWinner } from './roulette/winner';

interface RouletteWheelProps {
  participants: PresentParticipant[];
  isSpinning: boolean;
  baseTicketsLimit: number;
  finalTicketsLimit: number;
  winner?: PresentParticipant | null;
  onSpinComplete?: (winner: PresentParticipant) => void;
}

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  participants,
  isSpinning,
  baseTicketsLimit,
  finalTicketsLimit,
  winner,
  onSpinComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [currentArrowUser, setCurrentArrowUser] = useState<PresentParticipant | null>(null);
  const [isStopped, setIsStopped] = useState(false);

  const rotationRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const speedRef = useRef(15);
  const isDeceleratingRef = useRef(false);
  const prevIsSpinningRef = useRef<boolean | null>(null);
  const segmentsRef = useRef<ParticipantSegment[]>([]);

  const isIdle = participants.length > 0 && !isSpinning && !isStopped && !currentArrowUser;
  const displayWinner = winner ?? currentArrowUser;

  useEffect(() => {
    if (participants.length === 0) {
      setCurrentArrowUser(null);
      setIsStopped(false);
    }
  }, [participants]);

  useEffect(() => {
    if (currentArrowUser && !isStopped) {
      playTickSound();
    }
  }, [currentArrowUser, isStopped]);

  useEffect(() => {
    if (isStopped && currentArrowUser) {
      playFanfareSound();
    }
  }, [isStopped, currentArrowUser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    segmentsRef.current = drawRouletteWheel({
      canvas,
      participants,
      rotation,
      baseTicketsLimit,
      finalTicketsLimit,
    });
  }, [participants, rotation, baseTicketsLimit, finalTicketsLimit]);

  const updateArrowUser = () => {
    const currentSegment = findSegmentByArrow(rotationRef.current, segmentsRef.current);
    setCurrentArrowUser(currentSegment?.participant ?? null);
  };

  useEffect(() => {
    const animate = () => {
      rotationRef.current = (rotationRef.current + speedRef.current) % 360;
      setRotation(rotationRef.current);
      updateArrowUser();

      if (isSpinning && !isDeceleratingRef.current) {
        speedRef.current = 15;
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!isSpinning && !isDeceleratingRef.current) {
        isDeceleratingRef.current = true;
        const deceleration = 0.995;

        const decelerateAnimate = () => {
          rotationRef.current = (rotationRef.current + speedRef.current) % 360;
          setRotation(rotationRef.current);
          updateArrowUser();
          speedRef.current *= deceleration;

          if (speedRef.current > 0.05) {
            animationRef.current = requestAnimationFrame(decelerateAnimate);
            return;
          }

          speedRef.current = 0;
          isDeceleratingRef.current = false;
          animationRef.current = null;

          setTimeout(() => {
            setIsStopped(true);
          }, 2000);

          if (onSpinComplete && segmentsRef.current.length > 0) {
            const winnerParticipant = findWinner(rotationRef.current, segmentsRef.current);
            if (winnerParticipant) {
              setTimeout(() => {
                onSpinComplete(winnerParticipant);
              }, 500);
            }
          }
        };

        animationRef.current = requestAnimationFrame(decelerateAnimate);
      }
    };

    if (prevIsSpinningRef.current === null) {
      prevIsSpinningRef.current = isSpinning;
      return;
    }

    const prevIsSpinning = prevIsSpinningRef.current;
    prevIsSpinningRef.current = isSpinning;

    if (isSpinning && !prevIsSpinning) {
      speedRef.current = 15;
      isDeceleratingRef.current = false;
      setIsStopped(false);

      if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(animate);
      }
      return;
    }

    if (!isSpinning && prevIsSpinning && !isDeceleratingRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animate();
    }
  }, [isSpinning]);

  return (
    <div className='relative'>
      <RouletteDisplay
        canvasRef={canvasRef}
        participants={participants}
        isStopped={isStopped}
        isIdle={isIdle}
        currentArrowUser={currentArrowUser}
        displayWinner={displayWinner}
      />
    </div>
  );
};
