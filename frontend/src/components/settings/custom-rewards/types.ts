export interface CustomReward {
  id: string;
  title: string;
  prompt: string;
  cost: number;
  is_enabled: boolean;
  background_color: string;
  is_user_input_required: boolean;
  is_paused: boolean;
  is_in_stock: boolean;
  is_manageable?: boolean;
  saved_display_name?: string;
  saved_is_enabled?: boolean;
  redemptions_redeemed_current_stream?: number;
  max_per_stream_setting?: {
    is_enabled: boolean;
    max_per_stream: number;
  };
  max_per_user_per_stream_setting?: {
    is_enabled: boolean;
    max_per_user_per_stream: number;
  };
  global_cooldown_setting?: {
    is_enabled: boolean;
    global_cooldown_seconds: number;
  };
}

export interface CustomRewardsResponse {
  data: CustomReward[];
  error?: string;
}
