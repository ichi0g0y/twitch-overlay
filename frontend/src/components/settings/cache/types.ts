export interface CacheSettingsModel {
  expiry_days: number;
  max_size_mb: number;
  cleanup_enabled: boolean;
  cleanup_on_start: boolean;
}

export interface CacheStatsModel {
  total_files: number;
  total_size_bytes: number;
  oldest_file_date: string | null;
}
