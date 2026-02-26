import { Upload, X } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '../../ui/alert';
import { Button } from '../../ui/button';
import { CollapsibleCard } from '../../ui/collapsible-card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import type { GeneralSettingsFontProps } from './types';

export const FontSettingsCard: React.FC<GeneralSettingsFontProps> = ({
  getSettingValue,
  fileInputRef,
  uploadingFont,
  handleFontUpload,
  previewText,
  setPreviewText,
  previewImage,
  handleFontPreview,
  handleDeleteFont,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.general.font"
      title="フォント設定（必須）"
      description="FAXと時計機能を使用するためにフォントのアップロードが必要です"
      contentClassName="space-y-6"
    >
      {!getSettingValue('FONT_FILENAME') && (
        <Alert className="dark:bg-yellow-900/20 dark:border-yellow-700">
          <AlertDescription className="text-yellow-700 dark:text-yellow-200">
            ⚠️ フォントがアップロードされていません。FAXと時計機能を使用するには、フォントファイル（.ttf/.otf）をアップロードしてください。
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>フォントファイルをアップロード</Label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf"
              onChange={handleFontUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFont}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadingFont ? 'アップロード中...' : 'フォントをアップロード'}
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              .ttf または .otf ファイル
            </span>
          </div>
        </div>

        {getSettingValue('FONT_FILENAME') && (
          <>
            <div className="space-y-2">
              <Label>現在のフォント</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={getSettingValue('FONT_FILENAME')}
                  disabled
                  className="max-w-xs"
                />
                <Button
                  onClick={handleDeleteFont}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                  削除
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>フォントプレビュー</Label>
              <div className="space-y-2">
                <textarea
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md min-h-[80px] font-mono text-sm"
                  placeholder="プレビューテキストを入力..."
                />
                <Button
                  onClick={handleFontPreview}
                  variant="outline"
                  disabled={!getSettingValue('FONT_FILENAME')}
                >
                  プレビューを生成
                </Button>
              </div>
              {previewImage && (
                <div className="mt-2 p-4 bg-gray-100 dark:bg-gray-700 rounded">
                  <img
                    src={previewImage}
                    alt="Font Preview"
                    className="max-w-full h-auto border border-gray-300 dark:border-gray-600"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </CollapsibleCard>
  );
};
