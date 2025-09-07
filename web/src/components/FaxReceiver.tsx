import { useEffect, useState, useRef } from 'react';
import { useFaxQueue } from '../hooks/useFaxQueue';
import FaxDisplay from './FaxDisplay';
import DebugPanel from './DebugPanel';
import ClockDisplay from './ClockDisplay';
import MusicPlayer from './music/MusicPlayer';
import { LAYOUT } from '../constants/layout';
import { buildApiUrl } from '../utils/api';
import { initWebSocket } from '../utils/websocket';
import { useSettings } from '../contexts/SettingsContext';
import type { FaxData, FaxState, ServerStatus, DynamicStyles } from '../types';

// クライアントIDを生成（タブごとに一意）
const generateClientId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${random}`;
};

const FaxReceiver = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isPrinterConnected, setIsPrinterConnected] = useState<boolean>(false);
  const [labelPosition, setLabelPosition] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [faxState, setFaxState] = useState<FaxState | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const { currentFax, addToQueue, onDisplayComplete } = useFaxQueue();
  
  // クライアントIDを保持（コンポーネントのライフサイクル中は同じIDを使用）
  const clientIdRef = useRef<string>(generateClientId());
  
  // ラベル位置をリセット
  useEffect(() => {
    if (!currentFax) {
      setLabelPosition(0);
      setFaxState(null);
    }
  }, [currentFax]);
  
  // Settings from context
  const { settings } = useSettings();
  
  // URLパラメータからデバッグモードを取得
  const params = new URLSearchParams(window.location.search);
  const urlDebug = params.get('debug') === 'true';
  
  // デバッグモードはURLパラメータまたは設定のいずれかがtrueの場合に有効
  const isDebug = urlDebug || (settings?.debug_enabled ?? false);
  
  // 設定から表示状態を取得（設定がない場合はデフォルト値）
  // FAX表示はURLパラメータを優先、なければ設定値を使用
  const showFax = params.get('fax') !== 'false' && (settings?.fax_enabled ?? true);
  const playlistName = settings?.music_playlist || undefined;
  
  // 時計表示用 - URLパラメータを優先、なければデフォルトで表示
  const showLocation = params.get('location') !== 'false';
  const showDate = params.get('date') !== 'false';
  const showTime = params.get('time') !== 'false';
  const showStats = params.get('stats') !== 'false';
  
  // デバッグ情報をコンソールに出力
  useEffect(() => {
    if (isDebug && faxState) {
      console.log('FAX State:', faxState.state, 'Progress:', faxState.progress + '%');
    }
  }, [faxState, isDebug]);
  
  // 震え制御
  useEffect(() => {
    if (faxState) {
      setIsShaking(faxState.state === 'waiting' || faxState.state === 'scrolling');
    } else {
      setIsShaking(false);
    }
  }, [faxState]);

  // プリンター状態のポーリング
  useEffect(() => {
    const checkPrinterStatus = async () => {
      try {
        const response = await fetch(buildApiUrl('/status'));
        if (response.ok) {
          const data: ServerStatus = await response.json();
          setIsPrinterConnected(data.printerConnected);
        }
      } catch (error) {
        console.error('Failed to check printer status:', error);
      }
    };

    // 初回チェック
    checkPrinterStatus();

    // 5秒ごとにチェック
    const interval = setInterval(checkPrinterStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket接続の管理
  useEffect(() => {
    const wsClient = initWebSocket();
    
    // 接続状態の管理
    const unsubConnect = wsClient.onConnect(() => {
      setIsConnected(true);
      console.log('WebSocket connected in FaxReceiver');
    });
    
    const unsubDisconnect = wsClient.onDisconnect(() => {
      setIsConnected(false);
      console.log('WebSocket disconnected in FaxReceiver');
    });
    
    // FAXメッセージの処理
    const unsubFax = wsClient.on('fax', (data) => {
      console.log('Fax message received via WebSocket:', data);
      addToQueue(data as FaxData);
    });
    
    // stream_status_changedメッセージの処理（プリンター状態など）
    const unsubStreamStatus = wsClient.on('stream_status_changed', (data) => {
      console.log('Stream status changed via WebSocket:', data);
      // 必要に応じて処理を追加
    });

    return () => {
      // クリーンアップ: すべてのハンドラーを解除
      unsubConnect();
      unsubDisconnect();
      unsubFax();
      unsubStreamStatus();
    };
  }, [addToQueue]);

  // 背景スタイル
  const backgroundStyle: DynamicStyles = { 
    backgroundColor: isDebug ? '#374151' : 'transparent' 
  };

  // ラベルのスタイル
  const labelStyle: DynamicStyles = { 
    left: `${LAYOUT.LABEL_LEFT_MARGIN}px`, 
    width: `${LAYOUT.FAX_WIDTH}px`, 
    height: `${LAYOUT.LABEL_HEIGHT}px`,
    top: `${labelPosition}px`,
    transition: 'none' // 常にJavaScriptアニメーションを使用
  };

  // LED のスタイル
  const ledStyle: DynamicStyles = {
    fontSize: `${LAYOUT.FONT_SIZE}px`,
    marginRight: `${LAYOUT.LED_RIGHT_MARGIN}px`
  };

  // FAXテキストのスタイル
  const faxTextStyle: DynamicStyles = { 
    fontSize: `${LAYOUT.FONT_SIZE}px`,
    animation: isShaking ? `shake ${LAYOUT.SHAKE_DURATION} infinite` : 'none'
  };

  return (
    <div className="h-screen text-white relative overflow-hidden" style={backgroundStyle}>
      {/* コントロールパネル */}
      {showFax && (
        <div 
          className="fixed z-10" 
          style={labelStyle}
        >
          <div className="flex items-center h-full px-2">
            <span
              className={`text-outline ${
                !isConnected ? 'text-red-500' : 
                !isPrinterConnected ? 'text-yellow-500' : 
                'text-green-500'
              }`}
              style={ledStyle}
            >
              ◆
            </span>
            <span 
              className="text-outline" 
              style={faxTextStyle}
            >
              FAX
            </span>
          </div>
        </div>
      )}

      {/* Clock Display */}
      {(showLocation || showDate || showTime || showStats) && (
        <div className="fixed top-0 right-0 z-10">
          <ClockDisplay 
            showLocation={showLocation}
            showDate={showDate}
            showTime={showTime}
            showStats={showStats}
          />
        </div>
      )}

      {/* FAX表示エリア */}
      {showFax && currentFax && (
        <FaxDisplay
          faxData={currentFax}
          onComplete={onDisplayComplete}
          imageType={settings?.fax_image_type ?? 'mono'}
          onLabelPositionUpdate={setLabelPosition}
          onAnimationStateChange={setIsAnimating}
          onStateChange={setFaxState}
        />
      )}

      {/* デバッグパネル（デバッグモード時のみ表示） */}
      {isDebug && (
        <DebugPanel onSendFax={addToQueue} />
      )}

      {/* 音楽プレイヤー */}
      <MusicPlayer 
        playlist={playlistName || undefined}
      />
    </div>
  );
};

export default FaxReceiver;