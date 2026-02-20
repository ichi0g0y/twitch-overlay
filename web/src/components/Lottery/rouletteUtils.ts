import { calculateParticipantTickets } from '../../pages/present/utils/ticketCalculator';
import type { PresentParticipant } from '../../types';

export interface WheelSegment {
  participant: PresentParticipant;
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

const FALLBACK_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#a855f7',
];

export const normalizeDeg = (deg: number): number => {
  const normalized = deg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const matrixToRotationDeg = (transform: string): number | null => {
  if (!transform || transform === 'none') {
    return null;
  }

  const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((v) => Number(v.trim()));
    if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
      return normalizeDeg((Math.atan2(values[1], values[0]) * 180) / Math.PI);
    }
    return null;
  }

  const matrixMatch = transform.match(/^matrix\((.+)\)$/);
  if (!matrixMatch) {
    return null;
  }

  const values = matrixMatch[1].split(',').map((v) => Number(v.trim()));
  if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) {
    return null;
  }

  return normalizeDeg((Math.atan2(values[1], values[0]) * 180) / Math.PI);
};

export const buildSegments = (
  participants: PresentParticipant[],
  baseTicketsLimit: number,
  finalTicketsLimit: number
): WheelSegment[] => {
  if (participants.length === 0) {
    return [];
  }

  const weighted = participants.map((participant) => {
    const { finalTickets } = calculateParticipantTickets(participant, {
      baseTicketsLimit,
      finalTicketsLimit,
    });
    return {
      participant,
      tickets: Math.max(1, finalTickets),
    };
  });

  const totalTickets = weighted.reduce((sum, item) => sum + item.tickets, 0);
  let current = 0;

  return weighted.map((item) => {
    const angle = (item.tickets / totalTickets) * 360;
    const startDeg = current;
    const endDeg = current + angle;
    current = endDeg;

    return {
      participant: item.participant,
      startDeg,
      endDeg,
      midDeg: startDeg + angle / 2,
    };
  });
};

export const buildWheelGradient = (segments: WheelSegment[]): string => {
  if (segments.length === 0) {
    return 'conic-gradient(from -90deg, #334155 0deg 360deg)';
  }

  const stops = segments.map((segment, index) => {
    const color = segment.participant.assigned_color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    return `${color} ${segment.startDeg.toFixed(3)}deg ${segment.endDeg.toFixed(3)}deg`;
  });

  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
};

export const getSegmentIndexAtPointer = (
  segments: WheelSegment[],
  rotationDeg: number
): number | null => {
  if (segments.length === 0) {
    return null;
  }

  const pointerDeg = normalizeDeg(-rotationDeg);
  const foundIndex = segments.findIndex(
    (segment) => pointerDeg >= segment.startDeg && pointerDeg < segment.endDeg
  );

  if (foundIndex >= 0) {
    return foundIndex;
  }

  return segments.length - 1;
};
