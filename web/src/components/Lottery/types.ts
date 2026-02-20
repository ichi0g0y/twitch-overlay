import type { PresentParticipant } from '../../types';

export type LotteryPhase =
  | 'idle'
  | 'spinning'
  | 'decelerating'
  | 'revealing'
  | 'winner';

export interface LotteryRouletteProps {
  participants: PresentParticipant[];
  phase: LotteryPhase;
  baseTicketsLimit: number;
  finalTicketsLimit: number;
  winner: PresentParticipant | null;
  previousWinner: PresentParticipant | null;
  onDecelerationComplete?: (participant: PresentParticipant | null) => void;
}

export interface LotteryWinnerProps {
  winner: PresentParticipant;
}
