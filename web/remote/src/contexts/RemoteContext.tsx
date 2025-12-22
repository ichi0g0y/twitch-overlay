import React, { createContext, useContext, useEffect, useState } from 'react';
import { buildApiUrl } from '../utils/api';
import { getRemoteWebSocketClient } from '../utils/websocket';
import type { MusicStatus, OverlaySettings, Playlist, RewardGroup, CustomReward, RewardCount, AuthStatus } from '../types';

interface RemoteContextValue {
  overlaySettings: OverlaySettings;
  updateOverlaySettings: (settings: Partial<OverlaySettings>) => Promise<void>;
  musicStatus: MusicStatus;
  sendMusicCommand: (command: string, data?: any) => Promise<void>;
  playlists: Playlist[];
  rewardGroups: RewardGroup[];
  customRewards: CustomReward[];
  rewardCounts: RewardCount[];
  authStatus: AuthStatus | null;
  fetchRewardCounts: () => Promise<void>;
  isConnected: boolean;
}

const RemoteContext = createContext<RemoteContextValue | null>(null);

export const RemoteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({});
  const [musicStatus, setMusicStatus] = useState<MusicStatus>({
    playback_status: 'stopped',
    is_playing: false,
    current_track: null,
    current_time: 0,
    duration: 0,
    volume: 100,
  });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [rewardGroups, setRewardGroups] = useState<RewardGroup[]>([]);
  const [customRewards, setCustomRewards] = useState<CustomReward[]>([]);
  const [rewardCounts, setRewardCounts] = useState<RewardCount[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 初回設定取得
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const url = buildApiUrl('/api/settings/overlay');
        console.log('[RemoteContext] Fetching overlay settings from:', url);
        const response = await fetch(url);
        console.log('[RemoteContext] Overlay settings response:', response.status, response.statusText);
        if (response.ok) {
          const data = await response.json();
          console.log('[RemoteContext] Overlay settings data:', data);
          setOverlaySettings(data);
        } else {
          console.error('[RemoteContext] Failed to fetch overlay settings:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[RemoteContext] Failed to fetch overlay settings:', error);
      }
    };
    fetchSettings();
  }, []);

  // プレイリスト取得
  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/music/playlists'));
        if (response.ok) {
          const data = await response.json();
          setPlaylists(data.playlists || []);
        }
      } catch (error) {
        console.error('Failed to fetch playlists:', error);
      }
    };
    fetchPlaylists();
  }, []);

  // 認証状態取得
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/settings/auth/status'));
        if (response.ok) {
          const data = await response.json();
          setAuthStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
      }
    };
    fetchAuthStatus();
  }, []);

  // リワードグループ取得
  useEffect(() => {
    const fetchRewardGroups = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/twitch/reward-groups'));
        if (response.ok) {
          const result = await response.json();
          setRewardGroups(result.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch reward groups:', error);
      }
    };
    fetchRewardGroups();
  }, []);

  // カスタムリワード取得（認証済みの場合のみ）
  useEffect(() => {
    const fetchCustomRewards = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/twitch/custom-rewards'));
        if (response.ok) {
          const data = await response.json();
          setCustomRewards(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch custom rewards:', error);
      }
    };

    if (authStatus?.authenticated) {
      fetchCustomRewards();
    }
  }, [authStatus?.authenticated]);

  // リワードカウント取得関数
  const fetchRewardCounts = async () => {
    try {
      const groupId = overlaySettings?.reward_count_group_id;
      const endpoint = groupId
        ? `/api/twitch/reward-groups/${groupId}/counts`
        : '/api/twitch/reward-counts';
      const response = await fetch(buildApiUrl(endpoint));
      if (response.ok) {
        const counts = await response.json();
        setRewardCounts((counts || []).filter((c: RewardCount) => c.count > 0));
      }
    } catch (error) {
      console.error('Failed to fetch reward counts:', error);
    }
  };

  // リワードカウント初回取得
  useEffect(() => {
    if (overlaySettings?.reward_count_enabled) {
      fetchRewardCounts();
    } else {
      setRewardCounts([]);
    }
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  // WebSocket接続
  useEffect(() => {
    const wsClient = getRemoteWebSocketClient();

    wsClient.connect().then(() => setIsConnected(true));

    // music_statusを購読
    const unsubMusic = wsClient.on('music_status', (data) => {
      setMusicStatus(prev => ({ ...prev, ...data }));
    });

    // settingsを購読
    const unsubSettings = wsClient.on('settings', (data) => {
      setOverlaySettings(prev => ({ ...prev, ...data }));
    });

    // reward_count_updatedを購読
    const unsubRewardCountUpdated = wsClient.on('reward_count_updated', (data) => {
      console.log('Received reward_count_updated from WebSocket:', data);
      fetchRewardCounts();
    });

    // reward_counts_resetを購読
    const unsubRewardCountsReset = wsClient.on('reward_counts_reset', () => {
      console.log('Received reward_counts_reset from WebSocket');
      fetchRewardCounts();
    });

    return () => {
      unsubMusic();
      unsubSettings();
      unsubRewardCountUpdated();
      unsubRewardCountsReset();
    };
  }, [overlaySettings?.reward_count_enabled, overlaySettings?.reward_count_group_id]);

  const updateOverlaySettings = async (settings: Partial<OverlaySettings>) => {
    const response = await fetch(buildApiUrl('/api/settings/overlay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      throw new Error('Failed to update settings');
    }

    setOverlaySettings(prev => ({ ...prev, ...settings }));
  };

  const sendMusicCommand = async (command: string, data?: any) => {
    const url = buildApiUrl(`/api/music/control/${command}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });

    if (!response.ok) {
      throw new Error(`Failed to send music command: ${command}`);
    }
  };

  return (
    <RemoteContext.Provider value={{
      overlaySettings,
      updateOverlaySettings,
      musicStatus,
      sendMusicCommand,
      playlists,
      rewardGroups,
      customRewards,
      rewardCounts,
      authStatus,
      fetchRewardCounts,
      isConnected
    }}>
      {children}
    </RemoteContext.Provider>
  );
};

export const useRemote = () => {
  const context = useContext(RemoteContext);
  if (!context) {
    throw new Error('useRemote must be used within RemoteProvider');
  }
  return context;
};
