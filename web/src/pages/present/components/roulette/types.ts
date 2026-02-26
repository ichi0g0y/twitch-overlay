import type { PresentParticipant } from '../../../../types';

export interface ParticipantSegment {
  participant: PresentParticipant;
  totalWeight: number;
  startAngle: number;
  endAngle: number;
}
