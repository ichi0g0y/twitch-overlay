import type { PresentParticipant } from '../PresentPage';

const DEFAULT_BASE_TICKETS_LIMIT = 3;

const getTierCoefficient = (tier: string): number => {
  switch (tier) {
    case '1000':
      return 1.0;
    case '2000':
      return 1.1;
    case '3000':
      return 1.2;
    default:
      return 0;
  }
};

export const calculateBaseTickets = (
  entryCount: number,
  limit: number = DEFAULT_BASE_TICKETS_LIMIT
): number => {
  const safeLimit = limit > 0 ? limit : DEFAULT_BASE_TICKETS_LIMIT;
  const count = entryCount > 0 ? entryCount : 1;
  return Math.min(count, safeLimit);
};

export const calculateFinalTickets = (
  baseTickets: number,
  participant: PresentParticipant
): number => {
  const safeBaseTickets = Math.max(0, baseTickets);
  const coefficient = getTierCoefficient(participant.subscriber_tier);
  const subscribedMonths = Math.max(0, participant.subscribed_months || 0);

  let bonus = 0;
  if (participant.is_subscriber && coefficient > 0) {
    bonus = Math.ceil((subscribedMonths * coefficient * 1.1) / 3);
    if (bonus < 1) {
      bonus = 1;
    }
  }

  return safeBaseTickets + bonus;
};

export const calculateParticipantTickets = (participant: PresentParticipant) => {
  const baseTickets = calculateBaseTickets(participant.entry_count);
  const finalTickets = calculateFinalTickets(baseTickets, participant);
  return {
    baseTickets,
    finalTickets,
    bonusTickets: Math.max(0, finalTickets - baseTickets),
  };
};
