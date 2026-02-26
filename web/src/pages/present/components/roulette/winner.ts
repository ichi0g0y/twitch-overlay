import type { PresentParticipant } from '../../../../types';
import type { ParticipantSegment } from './types';

export const normalizeAngle = (angle: number): number => {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
};

export const getArrowAngle = (rotationDeg: number): number => {
  const rotationRad = (rotationDeg * Math.PI) / 180;
  return normalizeAngle(-Math.PI / 2 - rotationRad);
};

export const findSegmentByArrow = (
  rotationDeg: number,
  segments: ParticipantSegment[]
): ParticipantSegment | null => {
  if (segments.length === 0) {
    return null;
  }

  const arrowAngle = getArrowAngle(rotationDeg);

  for (const segment of segments) {
    const startAngle = normalizeAngle(segment.startAngle);
    const endAngle = normalizeAngle(segment.endAngle);

    if (startAngle <= endAngle) {
      if (arrowAngle >= startAngle && arrowAngle < endAngle) {
        return segment;
      }
      continue;
    }

    if (arrowAngle >= startAngle || arrowAngle < endAngle) {
      return segment;
    }
  }

  return null;
};

export const findWinner = (
  rotationDeg: number,
  segments: ParticipantSegment[]
): PresentParticipant | null => {
  const winnerSegment = findSegmentByArrow(rotationDeg, segments) ?? segments[0] ?? null;
  return winnerSegment?.participant ?? null;
};
