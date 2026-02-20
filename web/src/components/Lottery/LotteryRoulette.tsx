import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PresentParticipant } from '../../types';
import { playTickSound } from '../../utils/sound';
import {
  buildSegments,
  buildWheelGradient,
  getSegmentIndexAtPointer,
  matrixToRotationDeg,
  normalizeDeg,
} from './rouletteUtils';
import type { LotteryRouletteProps } from './types';

export const LotteryRoulette: React.FC<LotteryRouletteProps> = ({
  participants,
  phase,
  baseTicketsLimit,
  finalTicketsLimit,
  winner,
  previousWinner,
  onDecelerationComplete,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const monitorAnimationRef = useRef<number | null>(null);
  const decelerationAnimationRef = useRef<number | null>(null);
  const lastPointerSegmentRef = useRef<number | null>(null);
  const currentRotationRef = useRef(0);
  const onDecelerationCompleteRef = useRef(onDecelerationComplete);
  const [manualRotation, setManualRotation] = useState(0);
  const [pointedParticipant, setPointedParticipant] = useState<PresentParticipant | null>(null);

  useEffect(() => {
    onDecelerationCompleteRef.current = onDecelerationComplete;
  }, [onDecelerationComplete]);

  const segments = useMemo(
    () => buildSegments(participants, baseTicketsLimit, finalTicketsLimit),
    [participants, baseTicketsLimit, finalTicketsLimit]
  );
  const wheelGradient = useMemo(() => buildWheelGradient(segments), [segments]);

  const resolveRotationFromDom = (): number => {
    const element = wheelRef.current;
    if (!element) {
      return currentRotationRef.current;
    }
    const rotation = matrixToRotationDeg(window.getComputedStyle(element).transform);
    return rotation ?? currentRotationRef.current;
  };

  const updatePointer = (rotation: number, playTick: boolean): PresentParticipant | null => {
    const segmentIndex = getSegmentIndexAtPointer(segments, rotation);
    if (segmentIndex === null) {
      setPointedParticipant(null);
      lastPointerSegmentRef.current = null;
      return null;
    }

    const segment = segments[segmentIndex];
    if (!segment) {
      return null;
    }

    if (lastPointerSegmentRef.current !== segmentIndex) {
      if (playTick) {
        playTickSound();
      }
      lastPointerSegmentRef.current = segmentIndex;
      setPointedParticipant(segment.participant);
    }

    return segment.participant;
  };

  useEffect(() => {
    if (segments.length === 0) {
      setPointedParticipant(null);
      lastPointerSegmentRef.current = null;
      return;
    }
    updatePointer(currentRotationRef.current, false);
  }, [segments]);

  useEffect(() => {
    if (monitorAnimationRef.current !== null) {
      cancelAnimationFrame(monitorAnimationRef.current);
      monitorAnimationRef.current = null;
    }
    if (decelerationAnimationRef.current !== null) {
      cancelAnimationFrame(decelerationAnimationRef.current);
      decelerationAnimationRef.current = null;
    }

    if (phase === 'spinning') {
      const monitor = () => {
        const rotation = resolveRotationFromDom();
        currentRotationRef.current = rotation;
        updatePointer(rotation, true);
        monitorAnimationRef.current = requestAnimationFrame(monitor);
      };
      monitorAnimationRef.current = requestAnimationFrame(monitor);
      return () => {
        if (monitorAnimationRef.current !== null) {
          cancelAnimationFrame(monitorAnimationRef.current);
          monitorAnimationRef.current = null;
        }
      };
    }

    if (phase === 'decelerating') {
      const startRotation = resolveRotationFromDom();
      currentRotationRef.current = startRotation;
      setManualRotation(startRotation);

      let speedDegPerMs = 1.2;
      let prevTimestamp: number | null = null;

      const decelerate = (timestamp: number) => {
        if (prevTimestamp === null) {
          prevTimestamp = timestamp;
        }

        const deltaMs = Math.max(1, timestamp - prevTimestamp);
        prevTimestamp = timestamp;
        currentRotationRef.current = normalizeDeg(
          currentRotationRef.current + speedDegPerMs * deltaMs
        );
        setManualRotation(currentRotationRef.current);
        updatePointer(currentRotationRef.current, true);
        speedDegPerMs *= Math.pow(0.995, deltaMs);

        if (speedDegPerMs > 0.01) {
          decelerationAnimationRef.current = requestAnimationFrame(decelerate);
          return;
        }

        const resolvedWinner = updatePointer(currentRotationRef.current, false);
        onDecelerationCompleteRef.current?.(resolvedWinner);
      };

      decelerationAnimationRef.current = requestAnimationFrame(decelerate);
      return () => {
        if (decelerationAnimationRef.current !== null) {
          cancelAnimationFrame(decelerationAnimationRef.current);
          decelerationAnimationRef.current = null;
        }
      };
    }
  }, [phase, segments]);

  const revealParticipant = winner ?? pointedParticipant;
  const revealSegment = revealParticipant
    ? segments.find((segment) => segment.participant.user_id === revealParticipant.user_id) ?? null
    : null;
  const highlightStyle: React.CSSProperties | undefined =
    phase === 'revealing' && revealSegment
      ? {
          background: `conic-gradient(
            from -90deg,
            transparent 0deg ${revealSegment.startDeg}deg,
            rgba(255, 255, 255, 0.42) ${revealSegment.startDeg}deg ${revealSegment.endDeg}deg,
            transparent ${revealSegment.endDeg}deg 360deg
          )`,
        }
      : undefined;
  const wheelStyle: React.CSSProperties & Record<'--roulette-rotation-start', string> = {
    transform: phase === 'spinning' ? undefined : `rotate(${manualRotation}deg)`,
    '--roulette-rotation-start': `${manualRotation}deg`,
  };
  const statusText =
    participants.length === 0
      ? '参加者を待っています'
      : pointedParticipant
        ? `現在の候補: ${pointedParticipant.display_name || pointedParticipant.username} さん`
        : `参加者 ${participants.length} 名`;

  return (
    <div className="lottery-overlay-panel">
      <div className="lottery-roulette-shell">
        <div className="lottery-roulette-pointer" />
        <div
          ref={wheelRef}
          className={`lottery-roulette-wheel ${phase === 'spinning' ? 'lottery-roulette-spinning' : ''}`}
          style={wheelStyle}
        >
          <div className="lottery-roulette-disc" style={{ background: wheelGradient }}>
            {segments.map((segment) => {
              const angle = ((segment.endDeg - segment.startDeg) / 360) * 100;
              if (angle < 2.6) {
                return null;
              }

              const rad = ((segment.midDeg - 90) * Math.PI) / 180;
              const x = 50 + Math.cos(rad) * 36;
              const y = 50 + Math.sin(rad) * 36;
              const label = segment.participant.display_name || segment.participant.username;

              return (
                <div
                  key={segment.participant.user_id}
                  className="lottery-roulette-label"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          {highlightStyle && (
            <div
              className="lottery-roulette-highlight lottery-segment-pulse"
              style={highlightStyle}
            />
          )}
        </div>
      </div>

      <div className="lottery-roulette-status">{statusText}</div>
      {phase === 'idle' && previousWinner && (
        <div className="lottery-last-winner">
          前回当選: {previousWinner.display_name || previousWinner.username} さん
        </div>
      )}
    </div>
  );
};
