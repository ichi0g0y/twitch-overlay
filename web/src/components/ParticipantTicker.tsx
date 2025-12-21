import React, { useMemo, useEffect, useRef, useState } from 'react';
import type { PresentParticipant } from '../pages/present/PresentPage';
import { useSettings } from '../contexts/SettingsContext';

interface ParticipantTickerProps {
  participants: PresentParticipant[];
  enabled: boolean;
}

export const ParticipantTicker: React.FC<ParticipantTickerProps> = ({
  participants,
  enabled,
}) => {
  // 設定を取得
  const { settings } = useSettings();

  // アニメーション制御用のRef
  const animationIdRef = useRef<number | null>(null);
  const translateXRef = useRef<number>(0); // 現在のX位置（px）
  const containerRef = useRef<HTMLDivElement>(null); // ティッカーコンテナ
  const isPausedRef = useRef<boolean>(false); // ホバー一時停止用

  // DOM幅を測定（1セット分の幅）
  const [singleSetWidth, setSingleSetWidth] = useState<number>(0);

  // ティッカーアイテムのレンダリング
  const renderTickerItem = (participant: PresentParticipant, index: number) => {
    // サブスク状況に応じた装飾
    const isSubscriber = participant.is_subscriber;
    const subscriberTier = participant.subscriber_tier;

    // 口数計算（購入口数 + サブスクボーナス）
    const baseCount = participant.entry_count || 1;
    let bonusWeight = 0;
    if (isSubscriber) {
      if (subscriberTier === '3000') {
        bonusWeight = 12;
      } else if (subscriberTier === '2000') {
        bonusWeight = 6;
      } else if (subscriberTier === '1000') {
        bonusWeight = 3;
      }
    }

    return (
      <div
        key={`${participant.user_id}-${index}`}
        className="inline-flex items-center gap-3 pl-3 pr-5 py-2.5 text-white font-flat"
      >
        {/* アバター */}
        {participant.avatar_url ? (
          <img
            src={participant.avatar_url}
            alt={participant.display_name}
            className="w-8 h-8 rounded-full border-2 border-white flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center text-sm flex-shrink-0">
            👤
          </div>
        )}

        {/* 表示名 */}
        <span className="font-semibold text-lg whitespace-nowrap flex-shrink-0">
          {participant.display_name || participant.username}さん
        </span>

        {/* 口数表示 */}
        <span className="text-yellow-300 font-bold whitespace-nowrap flex-shrink-0">
          {bonusWeight > 0 ? `${baseCount}+${bonusWeight}口` : `${baseCount}口`}
        </span>

        {/* サブスクバッジ */}
        {isSubscriber && (
          <span className="text-xs px-2 py-0.5 rounded bg-white/20 whitespace-nowrap flex-shrink-0">
            Sub {subscriberTier === '3000' ? '3' : subscriberTier === '2000' ? '2' : '1'}
          </span>
        )}
      </div>
    );
  };

  // 参加者が複数回登場するリストを作成（seamlessループ用）
  const tickerContent = useMemo(() => {
    // 参加者が配列でない場合や空の場合は null を返す
    if (!Array.isArray(participants) || participants.length === 0) return null;

    // 参加者リストを2回繰り返し（無限スクロール実現）
    const duplicatedParticipants = [...participants, ...participants];

    return duplicatedParticipants.map((participant, index) =>
      renderTickerItem(participant, index)
    );
  }, [participants]);

  // 速度計算（参加者数とDOM幅に応じて調整）- px/frameで計算
  const baseSpeed = useMemo(() => {
    if (!Array.isArray(participants) || participants.length === 0 || singleSetWidth === 0) return 1;

    // 元のアニメーションと同じ速度を計算
    // animationDuration = 参加者数 * 3秒（最小10秒、最大60秒）
    const animationDuration = Math.max(10, Math.min(60, participants.length * 3));

    // singleSetWidth ピクセルを animationDuration 秒で移動
    // 1秒あたり: singleSetWidth / animationDuration ピクセル
    // 60fpsの場合、1フレームあたり: (singleSetWidth / animationDuration) / 60 ピクセル
    const speedPerFrame = singleSetWidth / animationDuration / 60;

    // 速度を少し下げる（約1.5倍遅く）
    const adjustedSpeed = speedPerFrame * 0.67;

    console.log('⚡ 速度計算:', { participants: participants.length, singleSetWidth, animationDuration, speedPerFrame, adjustedSpeed });

    return Math.max(0.3, adjustedSpeed); // 最低速度を保証
  }, [participants.length, singleSetWidth]);

  // DOM幅を測定（1セット分の幅）
  useEffect(() => {
    if (!containerRef.current) return;

    // DOMの更新を待ってから測定（レイアウト確定後）
    const measureWidth = () => {
      if (containerRef.current) {
        // 実際のDOM幅を測定（2セット分なので半分が1セット）
        const width = containerRef.current.scrollWidth / 2;
        console.log('🔍 DOM幅測定:', { scrollWidth: containerRef.current.scrollWidth, singleSetWidth: width });
        setSingleSetWidth(width);
      }
    };

    // requestAnimationFrameで次のフレームで測定（DOMレンダリング後）
    requestAnimationFrame(measureWidth);
  }, [participants]);

  // requestAnimationFrameによるアニメーションループ
  useEffect(() => {
    console.log('🎬 アニメーションループ開始チェック:', { enabled, participantsLength: participants.length, singleSetWidth, baseSpeed });
    // アニメーションが有効でない、参加者がいない、または幅が測定されていない場合は何もしない
    if (!enabled || participants.length === 0 || singleSetWidth === 0) {
      console.log('⚠️ アニメーション開始条件を満たしていません');
      // 既存のアニメーションをキャンセル
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      return;
    }

    console.log('✅ アニメーション開始!');
    const animate = () => {
      if (!isPausedRef.current) {
        // 左に移動（負の方向）
        translateXRef.current -= baseSpeed;

        // 1セット分移動したらリセット（シームレスループ）
        if (Math.abs(translateXRef.current) >= singleSetWidth) {
          translateXRef.current = 0;
        }

        // DOMに反映
        if (containerRef.current) {
          containerRef.current.style.transform = `translateX(${translateXRef.current}px)`;
        }
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    // クリーンアップ
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, [enabled, participants.length, singleSetWidth, baseSpeed]);

  // ホバー一時停止用イベントハンドラ
  const handleMouseEnter = () => {
    isPausedRef.current = true;
  };

  const handleMouseLeave = () => {
    isPausedRef.current = false;
  };

  if (!enabled || !Array.isArray(participants) || participants.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[10]">
      {/* お知らせ文 */}
      {settings?.ticker_notice_enabled && settings?.ticker_notice_text && (
        <div
          className="px-4"
          style={{
            fontSize: `${settings.ticker_notice_font_size}px`,
            textAlign: settings.ticker_notice_align as 'left' | 'center' | 'right',
          }}
        >
          <div className="text-white font-flat font-semibold">
            {settings.ticker_notice_text}
          </div>
        </div>
      )}

      {/* 既存のティッカー */}
      <div className="py-3 overflow-hidden">
        <div
          ref={containerRef}
          className="flex gap-2 whitespace-nowrap"
          style={{
            willChange: 'transform',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {tickerContent}
        </div>
      </div>
    </div>
  );
};
