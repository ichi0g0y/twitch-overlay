export type LotterySettingsState = {
  id: number;
  reward_id: string;
  last_winner: string;
  base_tickets_limit: number;
  final_tickets_limit: number;
  updated_at: string;
};

export type LotteryHistoryItem = {
  id: number;
  winner_name: string;
  total_participants: number;
  total_tickets: number;
  participants_json: string;
  reward_ids_json: string;
  drawn_at: string;
};

export type LotteryRuntimeState = {
  is_running: boolean;
  participants_count: number;
};

export type LotteryRewardOption = {
  id: string;
  title: string;
  cost: number;
};
