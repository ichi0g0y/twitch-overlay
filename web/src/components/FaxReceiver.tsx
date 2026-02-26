import { useEffect, useState } from 'react';
import { useFaxQueue } from '../hooks/useFaxQueue';
import FaxDisplay from './FaxDisplay';
import DebugPanel from './DebugPanel';
import MusicPlayer from './music/MusicPlayer';
import ClockDisplay from './ClockDisplay';
import RewardCountDisplay from './RewardCountDisplay';
import { LAYOUT } from '../constants/layout';
import { useSettings } from '../contexts/SettingsContext';
import { useFaxReceiverWebSocket } from './fax-receiver/useFaxReceiverWebSocket';
import type { FaxState, DynamicStyles } from '../types';

const FaxReceiver = () => {
  const [labelPosition, setLabelPosition] = useState<number>(0);
  const [, setIsAnimating] = useState<boolean>(false);
  const [faxState, setFaxState] = useState<FaxState | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [indicatorAnimation, setIndicatorAnimation] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden');
  const { currentFax, addToQueue, onDisplayComplete } = useFaxQueue();
  const { isConnected, isPrinterConnected } = useFaxReceiverWebSocket(addToQueue);

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
  const showClockIcons = settings?.clock_show_icons ?? true;

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
        <div className="fixed top-0 right-0 z-20 flex flex-col items-end gap-2">
          {showClock && (
            <ClockDisplay
              showLocation={showLocation}
              showDate={showDate}
              showTime={showTime}
              showIcons={showClockIcons}
            />
          )}
        </div>
      )}

      {/* リワードカウント表示（左側中央） */}
      <RewardCountDisplay />

      {/* コントロールパネル */}
      {showFax && (
        <div
          className={`fixed z-[15] ${getIndicatorClass()}`}
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
