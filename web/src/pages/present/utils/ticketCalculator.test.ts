import { describe, expect, test } from 'bun:test';
import { calculateFinalTickets, calculateParticipantTickets } from './ticketCalculator';

const buildParticipant = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'u1',
  username: 'user1',
  display_name: 'User1',
  avatar_url: '',
  redeemed_at: new Date().toISOString(),
  is_subscriber: false,
  subscribed_months: 0,
  subscriber_tier: '',
  entry_count: 3,
  assigned_color: '',
  ...overrides,
});

describe('ticketCalculator', () => {
  test('is_subscriber=true かつ tier不明でも最低1口ボーナスを付与する', () => {
    const participant = buildParticipant({
      is_subscriber: true,
      subscriber_tier: '',
      subscribed_months: 12,
    });

    const finalTickets = calculateFinalTickets(3, participant);
    expect(finalTickets).toBe(4);
  });

  test('finalTicketsLimit を適用する', () => {
    const participant = buildParticipant({
      is_subscriber: true,
      subscriber_tier: '3000',
      subscribed_months: 12,
    });

    const result = calculateParticipantTickets(participant, {
      baseTicketsLimit: 3,
      finalTicketsLimit: 7,
    });
    expect(result.finalTickets).toBe(7);
  });

  test('非サブスクは tier があってもボーナス加算しない', () => {
    const participant = buildParticipant({
      is_subscriber: false,
      subscriber_tier: '3000',
      subscribed_months: 24,
    });

    const finalTickets = calculateFinalTickets(3, participant);
    expect(finalTickets).toBe(3);
  });
});

