import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { PresentParticipant } from '../../types';
import { buildApiUrl } from '../../utils/api';
import { LotteryRoulette } from './LotteryRoulette';
import { LotteryWinner } from './LotteryWinner';
import type { LotteryPhase } from './types';

const DEFAULT_BASE_TICKETS_LIMIT = 3;
const DEFAULT_FINAL_TICKETS_LIMIT = 0;

const upsertParticipant = (
  participants: PresentParticipant[],
  incoming: PresentParticipant
): PresentParticipant[] => {
  const index = participants.findIndex((participant) => participant.user_id === incoming.user_id);
  if (index < 0) {
    return [...participants, incoming];
  }

  const next = [...participants];
  next[index] = incoming;
  return next;
};

export const LotteryOverlay: React.FC = () => {
  const [phase, setPhase] = useState<LotteryPhase>('idle');
  const [participants, setParticipants] = useState<PresentParticipant[]>([]);
  const [winner, setWinner] = useState<PresentParticipant | null>(null);
  const [revealedParticipant, setRevealedParticipant] = useState<PresentParticipant | null>(null);
  const [previousWinner, setPreviousWinner] = useState<PresentParticipant | null>(null);
  const [baseTicketsLimit, setBaseTicketsLimit] = useState(DEFAULT_BASE_TICKETS_LIMIT);
  const [finalTicketsLimit, setFinalTicketsLimit] = useState(DEFAULT_FINAL_TICKETS_LIMIT);
  const winnerTimerRef = useRef<number | null>(null);

  const clearWinnerTimer = useCallback(() => {
    if (winnerTimerRef.current !== null) {
      window.clearTimeout(winnerTimerRef.current);
      winnerTimerRef.current = null;
    }
  }, []);

  useWebSocket({
    onMessage: (message) => {
      switch (message.type) {
        case 'lottery_participant_added':
          if (message.data) {
            setParticipants((prev) => upsertParticipant(prev, message.data as PresentParticipant));
          }
          break;

        case 'lottery_participants_updated':
          if (Array.isArray(message.data)) {
            setParticipants(message.data as PresentParticipant[]);
          } else {
            setParticipants((message.data?.participants || []) as PresentParticipant[]);
            if (typeof message.data?.base_tickets_limit === 'number') {
              setBaseTicketsLimit(message.data.base_tickets_limit);
            }
            if (typeof message.data?.final_tickets_limit === 'number') {
              setFinalTicketsLimit(message.data.final_tickets_limit);
            }
          }
          break;

        case 'lottery_started':
          clearWinnerTimer();
          setWinner(null);
          setRevealedParticipant(null);
          setPhase('spinning');
          break;

        case 'lottery_stopped':
          setPhase((currentPhase) =>
            currentPhase === 'spinning' ? 'decelerating' : currentPhase
          );
          break;

        case 'lottery_winner':
          if (!message.data?.winner) {
            break;
          }

          clearWinnerTimer();
          winnerTimerRef.current = window.setTimeout(() => {
            const nextWinner = message.data.winner as PresentParticipant;
            setWinner(nextWinner);
            setPreviousWinner(nextWinner);
            setPhase('winner');
            winnerTimerRef.current = null;
          }, 2000);
          break;

        case 'lottery_participants_cleared':
          clearWinnerTimer();
          setParticipants([]);
          setWinner(null);
          setRevealedParticipant(null);
          setPreviousWinner(null);
          setPhase('idle');
          break;
      }
    },
  });

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/present/participants'));
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setParticipants((data.participants || []) as PresentParticipant[]);
        setBaseTicketsLimit(
          typeof data.base_tickets_limit === 'number'
            ? data.base_tickets_limit
            : DEFAULT_BASE_TICKETS_LIMIT
        );
        setFinalTicketsLimit(
          typeof data.final_tickets_limit === 'number'
            ? data.final_tickets_limit
            : DEFAULT_FINAL_TICKETS_LIMIT
        );

        if (data.winner) {
          setPreviousWinner(data.winner as PresentParticipant);
        }

        if (data.is_running) {
          setPhase('spinning');
        } else {
          setPhase('idle');
        }
      } catch (error) {
        console.error('[LotteryOverlay] Failed to fetch participants:', error);
      }
    };

    fetchParticipants();

    return () => {
      clearWinnerTimer();
    };
  }, [clearWinnerTimer]);

  const handleDecelerationComplete = useCallback((participant: PresentParticipant | null) => {
    setRevealedParticipant(participant);
    setPhase((currentPhase) =>
      currentPhase === 'decelerating' ? 'revealing' : currentPhase
    );
  }, []);

  return (
    <div className="lottery-overlay">
      <div className="lottery-overlay-inner">
        {phase === 'winner' && winner ? (
          <LotteryWinner winner={winner} />
        ) : (
          <LotteryRoulette
            participants={participants}
            phase={phase}
            baseTicketsLimit={baseTicketsLimit}
            finalTicketsLimit={finalTicketsLimit}
            winner={winner || revealedParticipant}
            previousWinner={previousWinner}
            onDecelerationComplete={handleDecelerationComplete}
          />
        )}
      </div>
    </div>
  );
};
