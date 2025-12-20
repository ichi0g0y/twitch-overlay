import React, { useEffect, useState } from 'react';
import FaxReceiver from '../components/FaxReceiver';
import { Toaster } from 'sonner';
import { ParticipantTicker } from '../components/ParticipantTicker';
import { useSettings } from '../contexts/SettingsContext';
import { getWebSocketClient } from '../utils/websocket';
import { buildApiUrl } from '../utils/api';
import type { PresentParticipant } from './present/PresentPage';

export const MainOverlay: React.FC = () => {
  const { settings } = useSettings();
  const [participants, setParticipants] = useState<PresentParticipant[]>([]);

  // WebSocketでプレゼント参加者の更新を監視
  useEffect(() => {
    const wsClient = getWebSocketClient();

    // 初期データ取得
    const fetchParticipants = async () => {
      try {
        const url = buildApiUrl('/api/present/participants');
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setParticipants(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch participants:', error);
      }
    };

    fetchParticipants();

    // WebSocketイベント購読
    const unsubAdded = wsClient.on('lottery_participant_added', (data: PresentParticipant) => {
      console.log('Participant added:', data);
      setParticipants((prev) => [...prev, data]);
    });

    const unsubUpdated = wsClient.on('lottery_participants_updated', (data: PresentParticipant[]) => {
      console.log('Participants updated:', data);
      setParticipants(data || []);
    });

    const unsubCleared = wsClient.on('lottery_participants_cleared', () => {
      console.log('Participants cleared');
      setParticipants([]);
    });

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubCleared();
    };
  }, []);

  return (
    <>
      <FaxReceiver />
      <Toaster position="top-right" richColors expand={true} duration={3000} />

      {/* 参加者ティッカー */}
      <ParticipantTicker
        participants={participants}
        enabled={settings?.lottery_ticker_enabled || false}
      />
    </>
  );
};
