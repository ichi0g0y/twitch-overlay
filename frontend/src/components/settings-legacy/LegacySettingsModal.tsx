import React from 'react';
import type {
  LegacySettingsViewActions,
  LegacySettingsViewState,
} from './types';

interface LegacySettingsModalProps {
  state: LegacySettingsViewState;
  actions: LegacySettingsViewActions;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onClose?: () => void;
}

export const LegacySettingsModal: React.FC<LegacySettingsModalProps> = ({
  state,
  actions,
  fileInputRef,
  onClose,
}) => {
  const {
    fontInfo,
    authInfo,
    uploading,
    previewText,
    previewImage,
    dragActive,
    error,
    success,
  } = state;

  const {
    setPreviewText,
    fetchAuthStatus,
    generatePreview,
    handleDeleteFont,
    handleDrag,
    handleDrop,
    handleFileSelect,
    formatFileSize,
  } = actions;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">設定</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {success}
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">フォント設定</h3>

            <div className="mb-4 p-4 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">現在のフォント:</div>
              <div className="font-medium">
                {fontInfo.hasCustomFont ? (
                  <>
                    {fontInfo.filename} ({formatFileSize(fontInfo.fileSize || 0)})
                    <div className="text-xs text-gray-500 mt-1">
                      更新日時: {fontInfo.modifiedAt}
                    </div>
                  </>
                ) : (
                  'デフォルトフォント (システムフォント)'
                )}
              </div>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf"
                onChange={handleFileSelect}
                className="hidden"
              />

              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              <p className="mt-2 text-sm text-gray-600">
                {uploading ? (
                  'アップロード中...'
                ) : (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      ファイルを選択
                    </button>
                    またはドラッグ＆ドロップ
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                TTF, OTF (最大50MB)
              </p>
            </div>

            {fontInfo.hasCustomFont && (
              <button
                onClick={() => void handleDeleteFont()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                カスタムフォントを削除
              </button>
            )}
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">フォントプレビュー</h3>

            <div className="mb-4">
              <input
                type="text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                onBlur={() => void generatePreview()}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="プレビューテキストを入力"
              />
            </div>

            {previewImage ? (
              <div className="border rounded p-4 bg-gray-50">
                <img
                  src={previewImage}
                  alt="Font preview"
                  className="max-w-full h-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            ) : (
              <div className="border rounded p-4 bg-gray-50 text-gray-500 text-center">
                <div>プレビューを生成できません</div>
                <button
                  onClick={() => void generatePreview()}
                  className="mt-2 text-blue-600 hover:text-blue-800 underline"
                >
                  再試行
                </button>
              </div>
            )}
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Twitch認証</h3>

            {authInfo && (
              <div className="border rounded p-4 bg-gray-50">
                {authInfo.authenticated ? (
                  <div>
                    <div className="flex items-center mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-green-700 font-medium">認証済み</span>
                    </div>
                    {authInfo.expiresAt && (
                      <p className="text-sm text-gray-600">
                        有効期限: {new Date(authInfo.expiresAt * 1000).toLocaleString('ja-JP')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                      <span className="text-red-700 font-medium">
                        {authInfo.error === 'No token found' ? '未認証' : 'トークン期限切れ'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Twitchアカウントを連携して、FAX機能を使用できるようにしてください。
                    </p>
                    <a
                      href={authInfo.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      Twitchでログイン
                    </a>
                  </div>
                )}
              </div>
            )}

            {authInfo && authInfo.authenticated && (
              <button
                onClick={() => void fetchAuthStatus()}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                認証状態を更新
              </button>
            )}
          </div>

          {onClose && (
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
