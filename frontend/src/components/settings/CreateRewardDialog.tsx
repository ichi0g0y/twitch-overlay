import React, { useState } from 'react';

import { buildApiUrl } from '../../utils/api';
import { CreateRewardForm } from './reward-dialog/CreateRewardForm';
import { defaultRewardFormData } from './reward-dialog/defaultFormData';
import type { RewardFormData } from './reward-dialog/types';

interface CreateRewardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateRewardDialog: React.FC<CreateRewardDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [formData, setFormData] = useState<RewardFormData>(defaultRewardFormData);
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
      setFormData(defaultRewardFormData());
    } catch (err) {
      console.error('Failed to create reward:', err);
      setError(err instanceof Error ? err.message : 'リワードの作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <CreateRewardForm
      formData={formData}
      creating={creating}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
      onChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
    />
  );
};
