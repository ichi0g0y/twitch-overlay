import React, { useEffect, useState } from 'react';
import { CustomFontLoader } from '../components/CustomFontLoader';
import FaxReceiver from '../components/FaxReceiver';
import { MicTranscriptOverlay } from '../components/MicTranscriptOverlay';
import { Toaster } from 'sonner';
import { ParticipantTicker } from '../components/ParticipantTicker';
import { useSettings } from '../contexts/SettingsContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { buildApiUrl } from '../utils/api';
import type { PresentParticipant } from './present/PresentPage';

export const MainOverlay: React.FC = () => {
  const { settings } = useSettings();
  const [participants, setParticipants] = useState<PresentParticipant[]>([]);

  // WebSocket接続を確立してプレゼント参加者の更新を監視
  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      switch (message.type) {
        case 'lottery_participant_added':
          console.log('[MainOverlay] Participant added:', message.data);
          setParticipants((prev) => [...prev, message.data]);
          break;

        case 'lottery_participants_updated':
          console.log('[MainOverlay] Participants updated:', message.data);
          if (Array.isArray(message.data)) {
            setParticipants(message.data || []);
          } else {
            setParticipants(message.data?.participants || []);
          }
          break;

        case 'lottery_participants_cleared':
          console.log('[MainOverlay] Participants cleared');
          setParticipants([]);
          break;
      }
    },
  });

  // WebSocket接続状態を監視
  useEffect(() => {
    console.log('[MainOverlay] WebSocket connection status:', isConnected);
  }, [isConnected]);

  // 初期データ取得
  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const url = buildApiUrl('/api/present/participants');
        console.log('[MainOverlay] Fetching participants from:', url);

        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          console.log('[MainOverlay] API response:', data);
          console.log('[MainOverlay] Participants count:', data.participants?.length || 0);

          setParticipants(data.participants || []);
        }
      } catch (error) {
        console.error('[MainOverlay] Failed to fetch participants:', error);
      }
    };

    fetchParticipants();
  }, []);

  // 参加者stateの変更を監視
  useEffect(() => {
    console.log('[MainOverlay] Participants state updated:', {
      count: participants.length,
      isArray: Array.isArray(participants),
      participants: participants.slice(0, 3),
    });
  }, [participants]);

  // ティッカー表示条件を監視
  useEffect(() => {
    const enabled = settings?.lottery_ticker_enabled || false;
    console.log('[MainOverlay] Ticker display conditions:', {
      enabled,
      participantsCount: participants.length,
      isArray: Array.isArray(participants),
      willDisplay: enabled && Array.isArray(participants) && participants.length > 0,
    });
  }, [settings?.lottery_ticker_enabled, participants]);

  return (
    <>
      <CustomFontLoader />
      <FaxReceiver />
      <MicTranscriptOverlay />
      <Toaster position="top-right" richColors expand={true} duration={3000} />

      {/* 参加者ティッカー */}
      <ParticipantTicker
        participants={Array.isArray(participants) ? participants : []}
        enabled={settings?.lottery_ticker_enabled || false}
      />
    </>
  );
};
