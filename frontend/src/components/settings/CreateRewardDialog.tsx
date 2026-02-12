import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { buildApiUrl } from '../../utils/api';

interface CreateRewardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface RewardFormData {
  title: string;
  cost: number;
  prompt: string;
  is_enabled: boolean;
  background_color: string;
  is_user_input_required: boolean;
  is_max_per_stream_enabled: boolean;
  max_per_stream: number;
  is_max_per_user_per_stream_enabled: boolean;
  max_per_user_per_stream: number;
  is_global_cooldown_enabled: boolean;
  global_cooldown_seconds: number;
  should_redemptions_skip_request_queue: boolean;
}

export const CreateRewardDialog: React.FC<CreateRewardDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [formData, setFormData] = useState<RewardFormData>({
    title: '',
    cost: 100,
    prompt: '',
    is_enabled: true,
    background_color: '',
    is_user_input_required: false,
    is_max_per_stream_enabled: false,
    max_per_stream: 0,
    is_max_per_user_per_stream_enabled: false,
    max_per_user_per_stream: 0,
    is_global_cooldown_enabled: false,
    global_cooldown_seconds: 0,
    should_redemptions_skip_request_queue: false,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('タイトルを入力してください');
      return;
    }

    if (formData.cost <= 0) {
      setError('コストは1以上である必要があります');
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(buildApiUrl('/api/twitch/custom-rewards/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'リワードの作成に失敗しました');
      }

      onCreated();
      onClose();

      // Reset form
      setFormData({
        title: '',
        cost: 100,
        prompt: '',
        is_enabled: true,
        background_color: '',
        is_user_input_required: false,
        is_max_per_stream_enabled: false,
        max_per_stream: 0,
        is_max_per_user_per_stream_enabled: false,
        max_per_user_per_stream: 0,
        is_global_cooldown_enabled: false,
        global_cooldown_seconds: 0,
        should_redemptions_skip_request_queue: false,
      });
    } catch (err) {
      console.error('Failed to create reward:', err);
      setError(err instanceof Error ? err.message : 'リワードの作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          {/* タイトル */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="リワードのタイトル"
              disabled={creating}
            />
          </div>

          {/* コスト */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              コスト <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              min="1"
              disabled={creating}
            />
          </div>

          {/* 説明 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              説明
            </label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              rows={3}
              placeholder="リワードの説明"
              disabled={creating}
            />
          </div>

          {/* 背景色 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              背景色
            </label>
            <input
              type="text"
              value={formData.background_color}
              onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="#9147FF"
              disabled={creating}
            />
          </div>

          {/* オプション */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.is_enabled}
                onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">有効にする</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.is_user_input_required}
                onChange={(e) => setFormData({ ...formData, is_user_input_required: e.target.checked })}
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">ユーザー入力を要求</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.should_redemptions_skip_request_queue}
                onChange={(e) =>
                  setFormData({ ...formData, should_redemptions_skip_request_queue: e.target.checked })
                }
                className="rounded"
                disabled={creating}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">リクエストキューをスキップ</span>
            </label>
          </div>

          {/* ストリームごとの上限 */}
          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_max_per_stream_enabled}
                onChange={(e) =>
                  setFormData({ ...formData, is_max_per_stream_enabled: e.target.checked })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, max_per_stream: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                disabled={creating}
              />
            )}
          </div>

          {/* ユーザーごとストリームごとの上限 */}
          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_max_per_user_per_stream_enabled}
                onChange={(e) =>
                  setFormData({ ...formData, is_max_per_user_per_stream_enabled: e.target.checked })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, max_per_user_per_stream: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                disabled={creating}
              />
            )}
          </div>

          {/* グローバルクールダウン */}
          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={formData.is_global_cooldown_enabled}
                onChange={(e) =>
                  setFormData({ ...formData, is_global_cooldown_enabled: e.target.checked })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, global_cooldown_seconds: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="1"
                placeholder="秒数"
                disabled={creating}
              />
            )}
          </div>

          {/* ボタン */}
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
