// 効果音再生ユーティリティ

// Audio要素のキャッシュ
const audioCache: Record<string, HTMLAudioElement> = {};

// グローバルなAudioContextを作成（再利用）
let audioContext: AudioContext | null = null;

/**
 * AudioContextを取得または作成
 */
const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  // AudioContextがsuspendされている場合はresume
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch((error) => {
      console.warn('Failed to resume AudioContext:', error);
    });
  }

  return audioContext;
};

/**
 * 効果音を再生する
 * @param soundPath - 音声ファイルのパス（public/からの相対パス）
 * @param volume - 音量（0.0 - 1.0）デフォルト: 0.5
 */
export const playSound = (soundPath: string, volume: number = 0.5): void => {
  try {
    // キャッシュから取得、なければ新規作成
    if (!audioCache[soundPath]) {
      audioCache[soundPath] = new Audio(soundPath);
    }

    const audio = audioCache[soundPath];
    audio.volume = Math.max(0, Math.min(1, volume)); // 0-1の範囲に制限

    // 再生中の場合は一旦停止してリセット
    audio.currentTime = 0;

    // 再生（非同期だがエラーハンドリング）
    audio.play().catch((error) => {
      console.warn('Failed to play sound:', soundPath, error);
    });
  } catch (error) {
    console.warn('Error playing sound:', soundPath, error);
  }
};

/**
 * Web Audio APIでビープ音を生成して再生
 * @param frequency - 周波数（Hz）
 * @param duration - 再生時間（ミリ秒）
 * @param volume - 音量（0.0 - 1.0）
 */
export const playBeep = (frequency: number = 800, duration: number = 50, volume: number = 0.3): void => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine'; // サイン波（やわらかい音）

    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration / 1000);

    oscillator.start(now);
    oscillator.stop(now + duration / 1000);
  } catch (error) {
    console.warn('Error playing beep:', error);
  }
};

/**
 * ルーレットのティック音を再生
 * 高頻度で呼ばれるため、常にWeb Audio APIのビープ音を使用（安定性重視）
 */
export const playTickSound = (): void => {
  // 高頻度再生に最適化：常にビープ音を使用
  playBeep(1200, 30, 0.15);
};

/**
 * ゴージャスなファンファーレを再生
 * 音声ファイルがある場合はそれを使用、なければ豪華な音階を生成
 */
export const playFanfareSound = (): void => {
  const fanfareSound = '/sounds/fanfare.mp3';

  const audio = new Audio(fanfareSound);
  audio.volume = 0.5;
  audio.currentTime = 0;

  audio.play().catch(() => {
    // ゴージャスなファンファーレを生成（TADA~~~~!）

    // Phase 1: ドラムロール風の連打（0-800ms）
    for (let i = 0; i < 8; i++) {
      setTimeout(() => playBeep(800, 50, 0.12), i * 100);
    }

    // Phase 2: 上昇音階 ド→レ→ミ→ファ→ソ→ラ→シ→ド（800-2000ms）
    const scale = [523, 587, 659, 698, 784, 880, 988, 1047]; // Cメジャースケール
    scale.forEach((freq, i) => {
      setTimeout(() => playBeep(freq, 150, 0.2 + i * 0.01), 800 + i * 150);
    });

    // Phase 3: フィニッシュ和音（2000-3000ms）
    // ド+ミ+ソを同時に鳴らして豪華に
    setTimeout(() => {
      playBeep(1047, 1000, 0.25); // ド（高）
      playBeep(1319, 1000, 0.2);  // ミ（高）
      playBeep(1568, 1000, 0.15); // ソ（高）
    }, 2000);
  });
};
