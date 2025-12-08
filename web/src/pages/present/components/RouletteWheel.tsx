import React, { useEffect, useRef, useState } from 'react';
import type { PresentParticipant } from '../PresentPage';

interface RouletteWheelProps {
  participants: PresentParticipant[];
  isSpinning: boolean;
  onSpinComplete?: (winner: PresentParticipant) => void;
}

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  participants,
  isSpinning,
  onSpinComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [currentArrowUser, setCurrentArrowUser] = useState<PresentParticipant | null>(null);
  const [isStopped, setIsStopped] = useState(false); // ルーレットが完全停止したか
  const rotationRef = useRef(0); // 最新の rotation 値を同期的に保持
  const animationRef = useRef<number | null>(null);
  const speedRef = useRef(15); // 現在の速度を保持
  const isDeceleratingRef = useRef(false); // 減速中かどうか
  const prevIsSpinningRef = useRef<boolean | null>(null); // 前回のisSpinning状態を保持
  const segmentsRef = useRef<Array<{
    participant: PresentParticipant;
    totalWeight: number;
    startAngle: number;
    endAngle: number;
  }>>([]);

  // 参加者がクリアされた時に当選者表示もリセット
  useEffect(() => {
    if (participants.length === 0) {
      setCurrentArrowUser(null);
      setIsStopped(false);
    }
  }, [participants]);

  // ルーレットの描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (participants.length === 0) {
      // 参加者がいない場合
      ctx.save();
      ctx.translate(centerX, centerY);

      // グレーの円を描画
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#4a5568';
      ctx.fill();
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 4;
      ctx.stroke();

      // テキスト
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('参加者なし', 0, 0);

      ctx.restore();
      return;
    }

    // 回転を適用（時計回りに）
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    // 参加者ごとにセグメント情報を計算
    interface ParticipantSegment {
      participant: typeof participants[0];
      totalWeight: number;
      startAngle: number;
      endAngle: number;
    }

    const segments: ParticipantSegment[] = [];
    let totalWeight = 0;

    // まず総口数を計算
    participants.forEach((participant) => {
      const baseCount = participant.entry_count || 1;

      // サブスク月数によるボーナス重み計算
      // ボーナス口数 = 累計サブスク月数 × Tier係数 × 1.1 ÷ 3（切り上げ）
      let bonusWeight = 0;
      if (participant.is_subscriber && participant.subscribed_months > 0) {
        // Tier係数を取得
        let tierMultiplier = 1.0;
        if (participant.subscriber_tier === '3000') {
          tierMultiplier = 1.2;
        } else if (participant.subscriber_tier === '2000') {
          tierMultiplier = 1.1;
        }

        // ボーナス計算（切り上げ）
        const bonusCalculation = (participant.subscribed_months * tierMultiplier * 1.1) / 3;
        bonusWeight = Math.ceil(bonusCalculation);

        // 最低ボーナス：サブスク登録者は最低1口
        if (bonusWeight < 1) {
          bonusWeight = 1;
        }
      }

      totalWeight += baseCount + bonusWeight;
    });

    // 各参加者のセグメント角度を計算
    let currentAngle = -Math.PI / 2; // 上部から開始
    participants.forEach((participant) => {
      const baseCount = participant.entry_count || 1;

      // ボーナス重み計算（同じロジック）
      let bonusWeight = 0;
      if (participant.is_subscriber && participant.subscribed_months > 0) {
        let tierMultiplier = 1.0;
        if (participant.subscriber_tier === '3000') {
          tierMultiplier = 1.2;
        } else if (participant.subscriber_tier === '2000') {
          tierMultiplier = 1.1;
        }

        const bonusCalculation = (participant.subscribed_months * tierMultiplier * 1.1) / 3;
        bonusWeight = Math.ceil(bonusCalculation);

        if (bonusWeight < 1) {
          bonusWeight = 1;
        }
      }

      const weight = baseCount + bonusWeight;
      const angleSize = (weight / totalWeight) * (Math.PI * 2);

      segments.push({
        participant,
        totalWeight: weight,
        startAngle: currentAngle,
        endAngle: currentAngle + angleSize,
      });

      currentAngle += angleSize;
    });

    // セグメント情報をrefに保存（停止時の当選者計算に使用）
    segmentsRef.current = segments;

    // 基本色パレット（フォールバック用）
    const baseColors = [
      '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
      '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7',
    ];

    // 各セグメントを描画
    segments.forEach((segment, index) => {
      const { participant, startAngle, endAngle } = segment;

      // 全参加者でバックエンドから割り当てられた色を使用
      // Twitch APIで取得した色、またはフォールバックとしてパレット色
      const fillColor = participant.assigned_color || baseColors[index % baseColors.length];

      // セグメント描画
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = participant.is_subscriber ? '#fbbf24' : '#fff';
      ctx.lineWidth = participant.is_subscriber ? 3 : 2;
      ctx.stroke();

      // テキスト描画（セグメントの中央）
      const angleSize = endAngle - startAngle;
      const textAngle = startAngle + angleSize / 2;

      ctx.save();

      // 外周から中心に向かって放射状にテキストを配置
      // textAngle で放射方向に向け、Math.PI で180度回転して逆向きに
      ctx.rotate(textAngle + Math.PI);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';  // 左端を基準（外周側）
      ctx.textBaseline = 'middle';

      // 表示名
      let displayName = participant.display_name || participant.username;
      if (displayName.length > 10) {
        displayName = displayName.substring(0, 8) + '...';
      }

      // セグメントが十分大きい場合のみ名前を表示（閾値を小さく）
      if (angleSize > 0.05) {
        // サブスクマーク（名前の前、外周側）
        if (participant.is_subscriber) {
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('⭐', -radius * 0.85, 0);
        }

        // 180度回転しているので、X座標を負にして外周側から開始
        // サブスクがある場合は少し中心寄りから、ない場合は外周から
        const textStartX = participant.is_subscriber ? -radius * 0.75 : -radius * 0.85;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(displayName, textStartX, 0);
      }

      ctx.restore();
    });

    // 中央の円
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#1f2937';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

    // 矢印を描画（上部中央）
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
  }, [participants, rotation]);

  // 矢印が指しているユーザーをリアルタイムで計算
  const updateArrowUser = () => {
    if (segmentsRef.current.length === 0) {
      setCurrentArrowUser(null);
      return;
    }

    const rotationRad = (rotationRef.current * Math.PI) / 180;
    let arrowAngle = -Math.PI / 2 - rotationRad;
    arrowAngle = ((arrowAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // 矢印が指しているセグメントを検索
    for (const segment of segmentsRef.current) {
      let startAngle = ((segment.startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let endAngle = ((segment.endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      let isInRange = false;
      if (startAngle <= endAngle) {
        isInRange = arrowAngle >= startAngle && arrowAngle < endAngle;
      } else {
        isInRange = arrowAngle >= startAngle || arrowAngle < endAngle;
      }

      if (isInRange) {
        setCurrentArrowUser(segment.participant);
        return;
      }
    }

    setCurrentArrowUser(null);
  };

  // スピンアニメーション
  useEffect(() => {
    const animate = () => {
      rotationRef.current = (rotationRef.current + speedRef.current) % 360;
      setRotation(rotationRef.current);
      updateArrowUser();  // 矢印が指しているユーザーを更新

      if (isSpinning && !isDeceleratingRef.current) {
        // 回転中：一定速度で回り続ける
        speedRef.current = 15;
        animationRef.current = requestAnimationFrame(animate);
      } else if (!isSpinning && !isDeceleratingRef.current) {
        // ストップ指示：減速開始
        isDeceleratingRef.current = true;
        const deceleration = 0.995; // 減速率（停止時間を1.5倍に）

        const decelerateAnimate = () => {
          rotationRef.current = (rotationRef.current + speedRef.current) % 360;
          setRotation(rotationRef.current);
          updateArrowUser();  // 矢印が指しているユーザーを更新

          speedRef.current *= deceleration;

          if (speedRef.current > 0.05) {
            animationRef.current = requestAnimationFrame(decelerateAnimate);
          } else {
            // 完全に停止
            speedRef.current = 0;
            isDeceleratingRef.current = false;
            animationRef.current = null;
            setIsStopped(true);  // 完全停止フラグを設定

            // 停止角度から当選者を計算
            if (onSpinComplete && segmentsRef.current.length > 0) {
              // 矢印は上部中央に固定されている
              // rotation は時計回りの回転角度（度数法）
              // セグメントは -π/2（上部）から反時計回りで定義されている

              // 現在の回転角度をラジアンに変換（時計回り）
              // rotationRef.current を使用して最新の値を取得
              const rotationRad = (rotationRef.current * Math.PI) / 180;

              // 矢印が指している角度を計算
              // 矢印は上部中央（12時の位置、-π/2）に固定
              // ルーレットが時計回りに回転した分を逆回転させて元の角度を求める
              let arrowAngle = -Math.PI / 2 - rotationRad;

              // 0-2πの範囲に正規化
              arrowAngle = ((arrowAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

              console.log('=== Winner Detection Debug ===');
              console.log('rotation (deg):', rotationRef.current.toFixed(2));
              console.log('arrowAngle (deg):', (arrowAngle * 180 / Math.PI).toFixed(2));

              // 矢印が指しているセグメントを探す（レンジベース検知）
              let winner: {
                participant: PresentParticipant;
                totalWeight: number;
                startAngle: number;
                endAngle: number;
              } | null = null;

              console.log('Segments:');
              segmentsRef.current.forEach((segment, index) => {
                let startAngle = ((segment.startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                let endAngle = ((segment.endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

                console.log(`  ${index}: ${segment.participant.display_name}`, {
                  start: (startAngle * 180 / Math.PI).toFixed(2) + '°',
                  end: (endAngle * 180 / Math.PI).toFixed(2) + '°'
                });

                // レンジベース検知（startAngleを含み、endAngleを含まない）
                let isInRange = false;
                if (startAngle <= endAngle) {
                  // 通常のケース（0度をまたがない）
                  isInRange = arrowAngle >= startAngle && arrowAngle < endAngle;
                } else {
                  // 0度をまたぐケース
                  isInRange = arrowAngle >= startAngle || arrowAngle < endAngle;
                }

                if (isInRange) {
                  winner = segment;
                  console.log(`  ✓ Winner found: ${segment.participant.display_name}`);
                }
              });

              // フォールバック：当選者が見つからない場合は最初のセグメントを使用
              if (!winner) {
                console.warn('No winner found, using first segment as fallback');
                winner = segmentsRef.current[0];
              }

              if (winner) {
                console.log('Winner:', winner.participant.display_name);
                // 少し待ってから当選者を通知（視覚的な演出のため）
                const winnerParticipant = winner.participant;
                setTimeout(() => {
                  onSpinComplete(winnerParticipant);
                }, 500);
              } else {
                console.error('No winner found for arrow angle:', arrowAngle);
              }
            }
          }
        };

        animationRef.current = requestAnimationFrame(decelerateAnimate);
      } else if (isDeceleratingRef.current) {
        // 減速中は何もしない（decelerateAnimateが継続中）
      }
    };

    // 初回マウント時はrefを初期化するのみ
    if (prevIsSpinningRef.current === null) {
      prevIsSpinningRef.current = isSpinning;
      return;
    }

    // 前回の状態を取得
    const prevIsSpinning = prevIsSpinningRef.current;
    prevIsSpinningRef.current = isSpinning;

    if (isSpinning && !prevIsSpinning) {
      // false→true：回転開始
      speedRef.current = 15;
      isDeceleratingRef.current = false;
      setIsStopped(false);  // 停止フラグをリセット

      if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(animate);
      }
    } else if (!isSpinning && prevIsSpinning && !isDeceleratingRef.current) {
      // true→false：減速開始
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animate();
    }

    return () => {
      // クリーンアップ時はアニメーションをキャンセルしない
      // （減速アニメーション中に中断されないように）
    };
  }, [isSpinning]);

  return (
    <div className="relative">
      {/* 矢印が指しているユーザー表示（完全停止後は「当選者」） - 高さ固定 */}
      <div className="text-center mb-4 min-h-36 flex items-center justify-center">
        {currentArrowUser && (
          <>
            {!isStopped ? (
              <div className="text-3xl font-bold text-yellow-300">
                {currentArrowUser.display_name || currentArrowUser.username}
              </div>
            ) : (
              <div className="animate-bounce">
                <div className="text-4xl font-bold text-yellow-300">🎉 当選者 🎉</div>
                <div className="text-5xl font-bold mt-6 text-white leading-tight">
                  {currentArrowUser.display_name || currentArrowUser.username}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col items-center justify-center">
        <canvas
          ref={canvasRef}
          width={600}
          height={600}
          className="max-w-full h-auto"
        />
      </div>
    </div>
  );
};
