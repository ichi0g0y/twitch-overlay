import React from 'react';
import { CollapsibleCard } from '../ui/collapsible-card';

export const ApiTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <CollapsibleCard
        panelId="settings.api.music-endpoints"
        title="Music API エンドポイント一覧"
        description="音楽機能で利用可能なAPIエンドポイントの一覧です"
        contentClassName="space-y-6"
      >
          {/* Track管理API */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold dark:text-white">Track管理</h3>
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/upload</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">ファイルアップロード (MP3/WAV/M4A/OGG)</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono rounded">GET</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/tracks</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">全トラック取得</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono rounded">GET</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/track/{`{id}`}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">トラック情報取得</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono rounded">GET</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/track/{`{id}`}/audio</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">音声ファイル取得 (ストリーミング対応)</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono rounded">GET</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/track/{`{id}`}/artwork</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">アートワーク画像取得</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs font-mono rounded">DELETE</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/track/{`{id}`}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">トラック削除</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs font-mono rounded">DELETE</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/track/all</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">全トラック削除</p>
              </div>
            </div>
          </div>

          {/* Playlist管理API */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold dark:text-white">Playlist管理</h3>
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/playlist</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">プレイリスト作成</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-mono rounded">GET</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/playlists</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">全プレイリスト取得</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs font-mono rounded">PUT</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/playlist/{`{id}`}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">プレイリスト更新</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs font-mono rounded">DELETE</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/playlist/{`{id}`}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">プレイリスト削除</p>
              </div>
            </div>
          </div>

          {/* 再生制御API */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold dark:text-white">再生制御</h3>
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/play</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">再生開始</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/pause</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">一時停止</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/stop</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">停止</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/next</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">次の曲へ</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/previous</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">前の曲へ</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/seek</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">シーク {`{ "position": 30.5 }`}</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-mono rounded">POST</span>
                  <span className="font-mono text-sm dark:text-gray-300">/api/music/control/volume</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">音量設定 {`{ "volume": 80 }`}</p>
              </div>
            </div>
          </div>

          {/* WebSocket */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold dark:text-white">WebSocket接続</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-mono rounded">WS</span>
                <span className="font-mono text-sm dark:text-gray-300">/ws</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                リアルタイム通信用WebSocketエンドポイント
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>• FAX受信通知</p>
                <p>• 音楽再生状態の同期</p>
                <p>• システムイベント通知</p>
              </div>
            </div>
          </div>
      </CollapsibleCard>
    </div>
  );
};
