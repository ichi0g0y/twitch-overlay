import { useEffect, useRef, useState } from 'react';
import { useMusicPlayerContext } from '../../contexts/MusicPlayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import { buildApiUrl } from '../../utils/api';
import TypewriterText from '../TypewriterText';
import MusicArtwork from './MusicArtwork';
import MusicProgress from './MusicProgress';

interface MusicPlayerProps {
  playlist?: string | undefined;
}

const MusicPlayer = ({ playlist: propPlaylist }: MusicPlayerProps) => {
  const player = useMusicPlayerContext();
  const { settings } = useSettings();

  // localStorageから保存された位置を復元、なければデフォルト値
  const getInitialPosition = () => {
    const saved = localStorage.getItem('debugPanelPosition');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: 10, y: window.innerHeight / 2 - 50 };
      }
    }
    return { x: 10, y: window.innerHeight / 2 - 50 };
  };

  const [debugPanelPosition, setDebugPanelPosition] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [animationState, setAnimationState] = useState<'entering' | 'idle' | 'exiting'>('idle');
  const [displayTrack, setDisplayTrack] = useState<typeof player.currentTrack>(null);
  const prevTrackIdRef = useRef<string | null>(null);
  const rotationRef = useRef<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [showTypewriter, setShowTypewriter] = useState(false);
  const rotationSpeedRef = useRef<number>(1); // 回転速度の倍率（1 = 通常速度、0 = 停止）
  const decelerationStartTimeRef = useRef<number | null>(null);
  const [isTrackEnding, setIsTrackEnding] = useState(false); // 曲終了による停止かどうか
  const [playerPosition, setPlayerPosition] = useState<'visible' | 'hidden' | 'entering'>('hidden'); // プレイヤーの表示位置
  
  // デバッグモードの確認
  const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
  
  // Settings からプレイリストを取得（propが優先）
  const playlist = propPlaylist ?? settings?.music_playlist ?? undefined;

  // プレイヤーの表示位置を制御
  useEffect(() => {
    if (player.playbackStatus === 'stopped') {
      setPlayerPosition('hidden');
    } else {
      // 再生/一時停止時は表示（スライドインアニメーション）
      if (playerPosition === 'hidden') {
        setPlayerPosition('entering');
        setTimeout(() => {
          setPlayerPosition('visible');
        }, 700); // アニメーション時間と同じ
      } else {
        setPlayerPosition('visible');
      }
    }
  }, [player.playbackStatus]);

  // トラック変更時のアニメーション制御
  useEffect(() => {
    // 初回起動時にcurrentTrackがある場合はdisplayTrackを設定
    if (!displayTrack && player.currentTrack) {
      setDisplayTrack(player.currentTrack);
      prevTrackIdRef.current = player.currentTrack.id;
    }
    
    // 新しいトラックが選択された時
    if (player.currentTrack && player.currentTrack.id !== prevTrackIdRef.current) {
      // 新しい曲が始まったらフラグをリセット
      setIsTrackEnding(false);
      if (prevTrackIdRef.current !== null) {
        // 前のトラックがある場合は退場アニメーション
        setAnimationState('exiting');
        setShowTypewriter(false);
        setTimeout(() => {
          setDisplayTrack(player.currentTrack);
          setAnimationState('entering');
          setShowTypewriter(true);
          setTimeout(() => {
            setAnimationState('idle');
          }, 600);
        }, 400);
      } else {
        // 初回は登場アニメーションのみ
        setDisplayTrack(player.currentTrack);
        setAnimationState('entering');
        setShowTypewriter(true);
        setTimeout(() => {
          setAnimationState('idle');
        }, 600);
      }
      prevTrackIdRef.current = player.currentTrack?.id || null;
    } else if (!player.currentTrack && prevTrackIdRef.current !== null) {
      // トラックが無くなった時（停止時は保持する）
      if (player.playbackStatus !== 'stopped') {
        setAnimationState('exiting');
        setShowTypewriter(false);
        setTimeout(() => {
          setDisplayTrack(null);
          setAnimationState('idle');
        }, 400);
        prevTrackIdRef.current = null;
      }
    }
  }, [player.currentTrack?.id]);
  
  // 初期化時にプレイリストを読み込む（サーバーから復元される）
  useEffect(() => {
    if (playlist) {
      // URLパラメータまたはSettingsで指定されている場合はそれを使用
      player.loadPlaylist(playlist);
    } else {
      // 指定がない場合はサーバーから状態を復元（プレイリスト名含む）
      player.loadPlaylist(undefined);
    }
  }, []); // 初回のみ実行
  
  // プレイリストの変更を監視
  useEffect(() => {
    if (playlist !== undefined) {
      player.loadPlaylist(playlist);
    }
  }, [playlist]);

  // 手動スタートのため、自動再生は無効化
  // useEffect(() => {
  //   if (enabled && player.playlist.length > 0 && !player.currentTrack) {
  //     // 少し遅延を入れて自動再生
  //     const timer = setTimeout(() => {
  //       player.play();
  //     }, 1000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [enabled, player.playlist.length]);
  
  // ドラッグハンドラー
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - debugPanelPosition.x,
      y: e.clientY - debugPanelPosition.y
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPosition = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setDebugPanelPosition(newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // ドラッグ終了時に位置をlocalStorageに保存
      localStorage.setItem('debugPanelPosition', JSON.stringify(debugPanelPosition));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, debugPanelPosition]);
  
  // 音楽状態をサーバーに送信
  useEffect(() => {
    const sendMusicStatus = async () => {
      try {
        const statusData = {
          playback_status: player.playbackStatus,
          is_playing: player.isPlaying, // 互換性のため
          current_track: player.currentTrack,
          progress: player.progress,
          current_time: player.currentTime,
          duration: player.duration,
          volume: player.volume,
          playlist_name: player.playlistName
        };
        
        // デバッグ用ログ（開発時のみ）
        if (process.env.NODE_ENV === 'development' && player.isPlaying) {
          console.debug(`[Overlay Send] time: ${player.currentTime?.toFixed(1)}s, progress: ${player.progress?.toFixed(1)}%`);
        }
        
        await fetch(buildApiUrl('/api/music/status/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statusData)
        });
      } catch (error) {
        // サイレントに失敗（Settingsが開いていない場合など）
      }
    };
    
    // 状態が変化したときに送信
    sendMusicStatus();
    
    // 定期的に進捗状態を送信（5秒ごと）
    let interval: NodeJS.Timeout | null = null;
    if (player.isPlaying) {
      interval = setInterval(sendMusicStatus, 5000); // 1秒→5秒に変更
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    player.playbackStatus, 
    player.isPlaying, 
    player.currentTrack?.id, 
    player.volume, 
    player.playlistName,
    Math.floor(player.currentTime || 0), // 整数化して頻繁な更新を防ぐ
    buildApiUrl
  ]);

  // 曲終了が近づいたことを検知
  useEffect(() => {
    // 曲の残り時間が3秒以下になったら曲終了フラグを立てる（3秒かけて減速）
    if (player.duration > 0 && player.currentTime > 0) {
      const remainingTime = player.duration - player.currentTime;
      if (remainingTime <= 3.0 && player.isPlaying && !isTrackEnding) {
        console.log('🎵 Track ending in 3 seconds, starting deceleration');
        setIsTrackEnding(true);
      }
    }
  }, [player.currentTime, player.duration, player.isPlaying, isTrackEnding]);

  // 回転アニメーションの管理
  useEffect(() => {
    let lastTime = performance.now();
    const DECELERATION_DURATION = 3000; // 3秒で減速
    
    const updateRotation = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      
      // 再生状態に応じて速度を調整
      if (player.isPlaying && !isTrackEnding) {
        // 再生中かつ曲終了ではない：通常速度
        rotationSpeedRef.current = 1;
        decelerationStartTimeRef.current = null;
      } else if (isTrackEnding && rotationSpeedRef.current > 0) {
        // 曲終了による停止：3秒かけて減速
        if (decelerationStartTimeRef.current === null) {
          decelerationStartTimeRef.current = currentTime;
        }
        
        const elapsedTime = currentTime - decelerationStartTimeRef.current;
        if (elapsedTime < DECELERATION_DURATION) {
          // イージング関数（ease-out）を使用した減速
          const progress = elapsedTime / DECELERATION_DURATION;
          const easeOut = 1 - Math.pow(progress, 3); // cubic ease-out
          rotationSpeedRef.current = easeOut;
        } else {
          // 減速完了
          rotationSpeedRef.current = 0;
        }
      } else if (!player.isPlaying && !isTrackEnding) {
        // 一時停止：即座に停止
        rotationSpeedRef.current = 0;
        decelerationStartTimeRef.current = null;
      }
      
      // 速度に応じて回転を更新
      if (rotationSpeedRef.current > 0) {
        // 20秒で360度 = 18度/秒（基本速度）
        const degreesPerMs = 360 / 20000;
        rotationRef.current = (rotationRef.current + deltaTime * degreesPerMs * rotationSpeedRef.current) % 360;
        setRotation(rotationRef.current);
      }
      
      lastTime = currentTime;
      animationFrameRef.current = requestAnimationFrame(updateRotation);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateRotation);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [player.isPlaying, isTrackEnding]);

  return (
    <>
      {/* デバッグ情報 - ドラッグ可能 */}
      {isDebug && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'fixed',
            top: `${debugPanelPosition.y}px`,
            left: `${debugPanelPosition.x}px`,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            border: '2px solid #10b981',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            opacity: isDragging ? 0.8 : 1,
            transition: isDragging ? 'none' : 'opacity 0.2s',
          }}
        >
          <div>Status: {player.playbackStatus === 'playing' ? '▶️' : player.playbackStatus === 'paused' ? '⏸️' : '⏹️'}</div>
          <div>Track: {player.currentTrack?.title || 'None'}</div>
          <div>Volume: {player.volume}%</div>
        </div>
      )}
      
      {/* プログレスバー - 最下部（停止時は完全に非表示） */}
      {playerPosition === 'visible' && (
        <MusicProgress
          progress={player.progress}
          isPlaying={player.isPlaying}
        />
      )}
      
      {/* アートワーク＋トラック情報 - 左下（常に表示、位置のみ変更） */}
      {displayTrack ? (
        <div
          className={`${animationState === 'entering' ? 'music-info-entering' : animationState === 'exiting' ? 'music-info-exiting' : ''} ${playerPosition === 'hidden' ? 'music-player-hidden' : playerPosition === 'entering' ? 'music-player-entering' : ''}`}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <MusicArtwork
            track={displayTrack}
            isPlaying={player.isPlaying}
            onPlayPause={() => player.isPlaying ? player.pause() : player.play()}
            audioElement={player.audioElement}
            rotation={rotation}
          />
          
          {/* トラック情報 */}
          <div
            className="text-outline"
            style={{
              position: 'relative',
              bottom: '28px',
              left: '40px',
              zIndex: 99,
              color: 'white',
              fontSize: '24px',
            }}
          >
            <div style={{ fontWeight: 'bold', minHeight: '24px' }}>
              {showTypewriter ? (
                <TypewriterText 
                  text={displayTrack.title}
                  speed={50}
                  delay={100}
                />
              ) : (
                displayTrack.title
              )}
            </div>
            <div style={{ fontSize: '10px', marginTop: '10px', minHeight: '12px' }}>
              {showTypewriter ? (
                <TypewriterText 
                  text={displayTrack.artist}
                  speed={50}
                  delay={100 + (displayTrack.title.length * 50)}
                />
              ) : (
                displayTrack.artist || '\u00A0'
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default MusicPlayer;