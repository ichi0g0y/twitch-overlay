import { useEffect, useState, useRef } from 'react';
import { useFaxQueue } from '../hooks/useFaxQueue';
import FaxDisplay from './FaxDisplay';
import DebugPanel from './DebugPanel';
import MusicPlayer from './music/MusicPlayer';
import ClockDisplay from './ClockDisplay';
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
  const [indicatorAnimation, setIndicatorAnimation] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden');
  const { currentFax, addToQueue, onDisplayComplete } = useFaxQueue();
  
  // クライアントIDを保持（コンポーネントのライフサイクル中は同じIDを使用）
  const clientIdRef = useRef<string>(generateClientId());
  
  // 処理済みメッセージIDを保持（重複処理を防ぐ）
  const processedMessageIds = useRef<Set<string>>(new Set());
  const messageIdTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // FAX状態をリセット
  useEffect(() => {
    if (!currentFax) {
      setFaxState(null);
      // labelPosition はリセットしない（次のFAX表示時に自動的に更新される）
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

  // 時計表示の設定を取得
  const showClock = settings?.clock_enabled ?? true;
  const showLocation = settings?.location_enabled ?? true;
  const showDate = settings?.date_enabled ?? true;
  const showTime = settings?.time_enabled ?? true;

  // デバッグ: 時計表示設定を確認
  useEffect(() => {
    console.log('🕐 Clock settings:', {
      settings,
      showClock,
      clock_enabled: settings?.clock_enabled,
      showLocation,
      showDate,
      showTime
    });
  }, [settings, showClock, showLocation, showDate, showTime]);
  
  
  // デバッグ情報をコンソールに出力
  useEffect(() => {
    if (isDebug && faxState) {
      // console.log('FAX State:', faxState.state, 'Progress:', faxState.progress + '%');
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

  // インジケーターのスライドアニメーション制御
  useEffect(() => {
    if (faxState && (faxState.state === 'waiting' || faxState.state === 'scrolling')) {
      // すでに表示中（entering または visible）なら何もしない
      if (indicatorAnimation === 'entering' || indicatorAnimation === 'visible') {
        return;
      }
      // 初回のみスライドイン
      setIndicatorAnimation('entering');
      const timer = setTimeout(() => {
        setIndicatorAnimation('visible');
      }, LAYOUT.FAX_INDICATOR_SLIDE_DURATION);
      return () => clearTimeout(timer);
    } else if (!faxState) {
      // 印刷終了: スライドアウト（すでにhiddenなら何もしない）
      if (indicatorAnimation === 'exiting' || indicatorAnimation === 'hidden') {
        return;
      }
      setIndicatorAnimation('exiting');
      const timer = setTimeout(() => {
        setIndicatorAnimation('hidden');
      }, LAYOUT.FAX_INDICATOR_SLIDE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [faxState, indicatorAnimation]);

  // プリンター状態の初期チェック（1回のみ）
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
        // エラー時はプリンター接続状態をfalseに設定しない
        // （WebSocketイベントで更新されるため）
      }
    };

    // 初回チェックのみ（ポーリングは廃止）
    checkPrinterStatus();
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
    
    // FAXメッセージの処理（重複チェック付き）
    const unsubFax = wsClient.on('fax', (data) => {
      const faxData = data as FaxData;
      
      // 重複チェック
      if (processedMessageIds.current.has(faxData.id)) {
        console.log('Duplicate fax message ignored:', faxData.id);
        return;
      }
      
      console.log('Fax message received via WebSocket:', data);
      
      // メッセージIDを処理済みとして記録
      processedMessageIds.current.add(faxData.id);
      
      // 5秒後にIDを削除（メモリリークを防ぐ）
      const timeoutId = setTimeout(() => {
        processedMessageIds.current.delete(faxData.id);
        messageIdTimeouts.current.delete(faxData.id);
      }, 5000);
      
      // 既存のタイムアウトがあればクリア
      const existingTimeout = messageIdTimeouts.current.get(faxData.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      messageIdTimeouts.current.set(faxData.id, timeoutId);
      
      // キューに追加
      addToQueue(faxData);
    });
    
    // stream_status_changedメッセージの処理（プリンター状態など）
    const unsubStreamStatus = wsClient.on('stream_status_changed', (data) => {
      console.log('Stream status changed via WebSocket:', data);
      // 必要に応じて処理を追加
    });

    // プリンター接続状態の変更を監視
    const unsubPrinterConnected = wsClient.on('printer_connected', () => {
      console.log('Printer connected via WebSocket');
      setIsPrinterConnected(true);
    });

    const unsubPrinterDisconnected = wsClient.on('printer_disconnected', () => {
      console.log('Printer disconnected via WebSocket');
      setIsPrinterConnected(false);
    });

    return () => {
      // クリーンアップ: すべてのハンドラーを解除
      unsubConnect();
      unsubDisconnect();
      unsubFax();
      unsubStreamStatus();
      unsubPrinterConnected();
      unsubPrinterDisconnected();
      
      // タイムアウトをクリア
      messageIdTimeouts.current.forEach(timeout => clearTimeout(timeout));
      messageIdTimeouts.current.clear();
    };
  }, [addToQueue]); // addToQueueを依存配列に戻す

  // 背景スタイル
  const backgroundStyle: DynamicStyles = { 
    backgroundColor: isDebug ? '#374151' : 'transparent' 
  };

  // ラベルのスタイル
  const labelStyle: DynamicStyles = {
    left: `${LAYOUT.LABEL_LEFT_MARGIN}px`,
    width: `${LAYOUT.FAX_WIDTH}px`,
    height: `${LAYOUT.LABEL_HEIGHT}px`,
    top: `${labelPosition}px`, // FAX画像に追従
    transition: 'none'
  };

  // インジケーターのアニメーションクラス
  const getIndicatorClass = (): string => {
    switch (indicatorAnimation) {
      case 'hidden': return 'fax-indicator-hidden';
      case 'entering': return 'fax-indicator-entering';
      case 'visible': return '';
      case 'exiting': return 'fax-indicator-exiting';
      default: return '';
    }
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
      {/* 時計表示（右上） */}
      {showClock && (
        <div className="fixed top-0 right-0 z-20">
          <ClockDisplay
            showLocation={showLocation}
            showDate={showDate}
            showTime={showTime}
          />
        </div>
      )}

      {/* コントロールパネル */}
      {showFax && (
        <div
          className={`fixed z-10 ${getIndicatorClass()}`}
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