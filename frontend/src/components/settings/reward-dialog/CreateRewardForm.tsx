import { Plus, X } from 'lucide-react';
import React from 'react';

import type { RewardFormData } from './types';

interface CreateRewardFormProps {
  formData: RewardFormData;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (updates: Partial<RewardFormData>) => void;
}

export const CreateRewardForm: React.FC<CreateRewardFormProps> = ({
  formData,
  creating,
  error,
  onClose,
  onSubmit,
  onChange,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold dark:text-white">新しいカスタムリワードを作成</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="リワードのタイトル"
              disabled={creating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              コスト <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.cost}
              onChange={(e) => onChange({ cost: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              min="1"
              disabled={creating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              説明
            </label>
            <textarea
              value={formData.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              rows={3}
              placeholder="リワードの説明"
              disabled={creating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              背景色
            </label>
            <input
              type="text"
              value={formData.background_color}
              onChange={(e) => onChange({ background_color: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="#9147FF"
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.is_enabled}
                onChange={(e) => onChange({ is_enabled: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">有効にする</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.is_user_input_required}
                onChange={(e) => onChange({ is_user_input_required: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">ユーザー入力を要求</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.should_redemptions_skip_request_queue}
                onChange={(e) => onChange({ should_redemptions_skip_request_queue: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">リクエストキューをスキップ</span>
            </label>
          </div>

          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_max_per_stream_enabled}
                onChange={(e) => onChange({ is_max_per_stream_enabled: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ストリームごとの上限を設定
              </span>
            </label>
            {formData.is_max_per_stream_enabled && (
              <input
                type="number"
                value={formData.max_per_stream}
                onChange={(e) => onChange({ max_per_stream: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                disabled={creating}
              />
            )}
          </div>

          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_max_per_user_per_stream_enabled}
                onChange={(e) => onChange({ is_max_per_user_per_stream_enabled: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ユーザーごとストリームごとの上限を設定
              </span>
            </label>
            {formData.is_max_per_user_per_stream_enabled && (
              <input
                type="number"
                value={formData.max_per_user_per_stream}
                onChange={(e) => onChange({ max_per_user_per_stream: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                disabled={creating}
              />
            )}
          </div>

          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_global_cooldown_enabled}
                onChange={(e) => onChange({ is_global_cooldown_enabled: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                グローバルクールダウンを設定
              </span>
            </label>
            {formData.is_global_cooldown_enabled && (
              <input
                type="number"
                value={formData.global_cooldown_seconds}
                onChange={(e) => onChange({ global_cooldown_seconds: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                placeholder="秒数"
                disabled={creating}
              />
            )}
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              disabled={creating}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? '作成中...' : '作成'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
