import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildApiUrl } from '../utils/api';
import { getWebSocketClient } from '../utils/websocket';
import * as App from '../../bindings/github.com/nantokaworks/twitch-overlay/app.js';

interface OverlaySettings {
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
  mic_transcript_font_size?: number;
  mic_transcript_max_lines?: number;
  mic_transcript_translation_enabled?: boolean;
  mic_transcript_translation_language?: string;
  mic_transcript_translation_font_size?: number;
  mic_transcript_line_ttl_seconds?: number;
  mic_transcript_last_ttl_seconds?: number;

  // OpenAI使用量表示
  openai_usage_enabled?: boolean;

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

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<OverlaySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 設定を取得する関数（再利用可能）
  const fetchSettings = useCallback(async () => {
    try {
      const port = await App.GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/settings/overlay`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        console.log('📥 Settings fetched:', data);
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
      console.log('📡 Settings updated via WebSocket, refetching all settings...');
      // 部分更新ではなく、全設定を再取得して最新の状態を反映
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
      const port = await App.GetServerPort();
      const response = await fetch(`http://localhost:${port}/api/settings/overlay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        // サーバーが成功したら、SSE経由で更新が来るのを待つ
        // 楽観的更新を行う
        setSettings(prev => ({ ...prev, ...updates }));
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
