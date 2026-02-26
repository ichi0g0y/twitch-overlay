import type { RewardFormData } from './types';

export const defaultRewardFormData = (): RewardFormData => ({
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
