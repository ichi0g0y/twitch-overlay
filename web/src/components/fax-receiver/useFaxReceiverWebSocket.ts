import { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../utils/api';
import { initWebSocket } from '../../utils/websocket';
import type { FaxData, ServerStatus } from '../../types';

interface UseFaxReceiverWebSocketResult {
  isConnected: boolean;
  isPrinterConnected: boolean;
}

export function useFaxReceiverWebSocket(
  addToQueue: (faxData: FaxData) => void,
): UseFaxReceiverWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const messageIdTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    const checkPrinterStatus = async () => {
      try {
        const response = await fetch(buildApiUrl('/status'));
        if (response.ok) {
          const data: ServerStatus = await response.json();
          setIsPrinterConnected(data.printerConnected);
        }
      } catch (error) {
        console.error('Failed to check initial printer status:', error);
      }
    };

    checkPrinterStatus();
  }, []);

  useEffect(() => {
    const wsClient = initWebSocket();

    const unsubConnect = wsClient.onConnect(() => {
      setIsConnected(true);
      console.log('WebSocket connected in FaxReceiver');
    });

    const unsubDisconnect = wsClient.onDisconnect(() => {
      setIsConnected(false);
      console.log('WebSocket disconnected in FaxReceiver');
    });

    const unsubFax = wsClient.on('fax', (data) => {
      const faxData = data as FaxData;
      if (processedMessageIds.current.has(faxData.id)) {
        console.log('Duplicate fax message ignored:', faxData.id);
        return;
      }

      console.log('Fax message received via WebSocket:', data);
      processedMessageIds.current.add(faxData.id);

      const timeoutId = setTimeout(() => {
        processedMessageIds.current.delete(faxData.id);
        messageIdTimeouts.current.delete(faxData.id);
      }, 5000);

      const existingTimeout = messageIdTimeouts.current.get(faxData.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      messageIdTimeouts.current.set(faxData.id, timeoutId);
      addToQueue(faxData);
    });

    const unsubStreamStatus = wsClient.on('stream_status_changed', (data) => {
      console.log('Stream status changed via WebSocket:', data);
    });

    const unsubPrinterConnected = wsClient.on('printer_connected', () => {
      console.log('Printer connected via WebSocket');
      setIsPrinterConnected(true);
    });

    const unsubPrinterDisconnected = wsClient.on('printer_disconnected', () => {
      console.log('Printer disconnected via WebSocket');
      setIsPrinterConnected(false);
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubFax();
      unsubStreamStatus();
      unsubPrinterConnected();
      unsubPrinterDisconnected();

      messageIdTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      messageIdTimeouts.current.clear();
    };
  }, [addToQueue]);

  return { isConnected, isPrinterConnected };
}
