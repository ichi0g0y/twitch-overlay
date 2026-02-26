import type { PresentParticipant } from '../../../../types';
import { calculateParticipantTickets } from '../../utils/ticketCalculator';
import type { ParticipantSegment } from './types';

interface DrawRouletteWheelParams {
  canvas: HTMLCanvasElement;
  participants: PresentParticipant[];
  rotation: number;
  baseTicketsLimit: number;
  finalTicketsLimit: number;
}

export const drawRouletteWheel = ({
  canvas,
  participants,
  rotation,
  baseTicketsLimit,
  finalTicketsLimit,
}: DrawRouletteWheelParams): ParticipantSegment[] => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return [];
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (participants.length === 0) {
    ctx.save();
    ctx.translate(centerX, centerY);

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#4a5568';
    ctx.fill();
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('参加者なし', 0, 0);

    ctx.restore();
    return [];
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);

  const segments: ParticipantSegment[] = [];
  let totalWeight = 0;

  participants.forEach((participant) => {
    const { finalTickets } = calculateParticipantTickets(participant, {
      baseTicketsLimit,
      finalTicketsLimit,
    });
    totalWeight += finalTickets;
  });

  let currentAngle = -Math.PI / 2;
  participants.forEach((participant) => {
    const { finalTickets } = calculateParticipantTickets(participant, {
      baseTicketsLimit,
      finalTicketsLimit,
    });
    const angleSize = (finalTickets / totalWeight) * Math.PI * 2;

    segments.push({
      participant,
      totalWeight: finalTickets,
      startAngle: currentAngle,
      endAngle: currentAngle + angleSize,
    });

    currentAngle += angleSize;
  });

  const baseColors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7',
  ];

  segments.forEach((segment, index) => {
    const { participant, startAngle, endAngle } = segment;
    const fillColor = participant.assigned_color || baseColors[index % baseColors.length];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = participant.is_subscriber ? '#fbbf24' : '#fff';
    ctx.lineWidth = participant.is_subscriber ? 3 : 2;
    ctx.stroke();

    const angleSize = endAngle - startAngle;
    const textAngle = startAngle + angleSize / 2;

    ctx.save();
    ctx.rotate(textAngle + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let displayName = (participant.display_name || participant.username) + 'さん';
    if (displayName.length > 10) {
      displayName = `${displayName.substring(0, 8)}...`;
    }

    if (angleSize > 0.05) {
      if (participant.is_subscriber) {
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('⭐', -radius * 0.85, 0);
      }

      const textStartX = participant.is_subscriber ? -radius * 0.75 : -radius * 0.85;
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(displayName, textStartX, 0);
    }

    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#1f2937';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = '#fbbf24';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 30);
  ctx.lineTo(centerX - 20, 60);
  ctx.lineTo(centerX + 20, 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return segments;
};
