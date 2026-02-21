import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildApiUrl } from '../utils/api';
import { getWebSocketClient } from '../utils/websocket';

export interface OverlaySettings {
  // 音楽プレイヤー設定
  music_playlist: string | null;
  music_volume: number;

  // FAX表示設定
  fax_enabled: boolean;
  fax_animation_speed: number;
  fax_image_type: 'mono' | 'color';

  // 時計表示設定
  clock_enabled?: boolean;
  clock_format?: string;
  clock_show_icons?: boolean;
  location_enabled?: boolean;
  date_enabled?: boolean;
  time_enabled?: boolean;

  // リワードカウント表示設定
  reward_count_enabled?: boolean;
  reward_count_group_id?: number | null;
  reward_count_position?: 'left' | 'right';

  // プレゼントルーレット設定
  lottery_enabled?: boolean;
  lottery_reward_id?: string | null;
  lottery_display_duration?: number;
  lottery_animation_speed?: number;
  lottery_ticker_enabled?: boolean;

  // ティッカーお知らせ設定
  ticker_notice_enabled?: boolean;
  ticker_notice_text?: string;
  ticker_notice_font_size?: number;
  ticker_notice_align?: 'left' | 'center' | 'right';

  // マイク文字起こし表示設定
  mic_transcript_enabled?: boolean;
  mic_transcript_position?: string;
  mic_transcript_v_align?: string;
  mic_transcript_frame_height_px?: number;
  mic_transcript_font_size?: number;
  mic_transcript_max_lines?: number;
  mic_transcript_max_width_px?: number;
  mic_transcript_text_align?: string;
  mic_transcript_white_space?: string;
  mic_transcript_background_color?: string;
  mic_transcript_timer_ms?: number;
  mic_transcript_interim_marker_left?: string;
  mic_transcript_interim_marker_right?: string;
  mic_transcript_line_spacing_1_px?: number;
  mic_transcript_line_spacing_2_px?: number;
  mic_transcript_line_spacing_3_px?: number;
  mic_transcript_text_color?: string;
  mic_transcript_stroke_color?: string;
  mic_transcript_stroke_width_px?: number;
  mic_transcript_font_weight?: number;
  mic_transcript_font_family?: string;
  mic_transcript_speech_enabled?: boolean;
  mic_transcript_speech_language?: string;
  mic_transcript_speech_short_pause_ms?: number;
  mic_transcript_speech_interim_throttle_ms?: number;
  mic_transcript_speech_dual_instance_enabled?: boolean;
  mic_transcript_speech_restart_delay_ms?: number;
  mic_transcript_bouyomi_enabled?: boolean;
  mic_transcript_bouyomi_url?: string;
  mic_transcript_anti_sexual_enabled?: boolean;
  mic_transcript_translation_enabled?: boolean;
  mic_transcript_translation_mode?: string;
  mic_transcript_translation_language?: string;
  mic_transcript_translation2_language?: string;
  mic_transcript_translation3_language?: string;
  mic_transcript_translation_position?: string;
  mic_transcript_translation_max_width_px?: number;
  mic_transcript_translation_font_size?: number;
  mic_transcript_translation_font_weight?: number;
  mic_transcript_translation_text_color?: string;
  mic_transcript_translation_stroke_color?: string;
  mic_transcript_translation_stroke_width_px?: number;
  mic_transcript_translation_font_family?: string;
  mic_transcript_translation2_font_size?: number;
  mic_transcript_translation2_font_weight?: number;
  mic_transcript_translation2_text_color?: string;
  mic_transcript_translation2_stroke_color?: string;
  mic_transcript_translation2_stroke_width_px?: number;
  mic_transcript_translation2_font_family?: string;
  mic_transcript_translation3_font_size?: number;
  mic_transcript_translation3_font_weight?: number;
  mic_transcript_translation3_text_color?: string;
  mic_transcript_translation3_stroke_color?: string;
  mic_transcript_translation3_stroke_width_px?: number;
  mic_transcript_translation3_font_family?: string;
  mic_transcript_line_ttl_seconds?: number;
  mic_transcript_last_ttl_seconds?: number;

  // UI状態設定
  overlay_cards_expanded?: string;
  overlay_cards_layout?: string;

  // プリンター設定
  best_quality?: boolean;
  dither?: boolean;
  black_point?: number;
  auto_rotate?: boolean;
  rotate_print?: boolean;

  // 開発者設定
  debug_enabled: boolean;

  updated_at: string;
}

interface SettingsContextType {
  settings: OverlaySettings | null;
  updateSettings: (updates: Partial<OverlaySettings>) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

function coerceOverlayValue(val: unknown): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (typeof val === 'string' && val !== '' && !Number.isNaN(Number(val))) {
    return Number(val);
  }
  return val;
}

function applyClockDetailKeyAliases(target: Record<string, unknown>): void {
  const aliasPairs: Array<[string, string]> = [
    ['location_enabled', 'overlay_location_enabled'],
    ['date_enabled', 'overlay_date_enabled'],
    ['time_enabled', 'overlay_time_enabled'],
  ];

  for (const [newKey, legacyKey] of aliasPairs) {
    const newValue = target[newKey];
    const legacyValue = target[legacyKey];
    if (newValue === undefined && legacyValue !== undefined) {
      target[newKey] = legacyValue;
    }
    if (legacyValue === undefined && newValue !== undefined) {
      target[legacyKey] = newValue;
    }
  }
}

function normalizeOverlayData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    result[key] = coerceOverlayValue(val);
  }
  applyClockDetailKeyAliases(result);
  return result;
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<OverlaySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 設定を取得する関数（再利用可能）
  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/overlay'));
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        const normalizedData = normalizeOverlayData(data) as unknown as OverlaySettings;
        setSettings(normalizedData);
        console.log('📥 Settings fetched:', normalizedData);
      } else {
        setError('Failed to load settings');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  // 初期設定を取得
  useEffect(() => {
    const loadSettings = async () => {
      await fetchSettings();
      setIsLoading(false);
    };
    loadSettings();
  }, [fetchSettings]);

  // WebSocketで設定変更を監視
  useEffect(() => {
    const wsClient = getWebSocketClient();

    // 設定更新メッセージを処理
    const unsubSettings = wsClient.on('settings', (data) => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const normalizedData = normalizeOverlayData(data as Record<string, unknown>) as unknown as OverlaySettings;
        setSettings(normalizedData);
        console.log('📡 Settings updated via WebSocket:', normalizedData);
        return;
      }

      console.log('📡 Settings updated via WebSocket, but payload was invalid. Refetching settings...');
      fetchSettings();
    });

    return () => {
      unsubSettings();
    };
  }, [fetchSettings]);

  // 設定を更新
  const updateSettings = useCallback(async (updates: Partial<OverlaySettings>) => {
    if (!settings) return;

    try {
      const response = await fetch(buildApiUrl('/api/settings/overlay'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        // サーバーが成功したら、SSE経由で更新が来るのを待つ
        // 楽観的更新を行う
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, value]) => value !== undefined),
        ) as Partial<OverlaySettings>;
        setSettings(prev => (prev ? { ...prev, ...cleanUpdates } : prev));
      } else {
        throw new Error('Failed to update settings');
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError('Failed to update settings');
      throw err;
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading, error }}>
      {children}
    </SettingsContext.Provider>
  );
};
