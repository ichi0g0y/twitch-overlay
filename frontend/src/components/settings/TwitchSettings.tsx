import React, { useContext, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { CustomRewardsList } from './CustomRewardsList';
import { RewardGroupsManager } from './RewardGroupsManager';

export const TwitchSettings: React.FC = () => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('TwitchSettings must be used within SettingsPageProvider');
  }

  const {
    settings,
    authStatus,
    unsavedChanges,
    getSettingValue,
    handleSettingChange,
    showSecrets,
    setShowSecrets,
    handleTwitchAuth,
    handleTokenRefresh,
    setUnsavedChanges,
  } = context;

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Twitch API設定</CardTitle>
          <CardDescription>
            Twitch Developersで取得したAPI情報を設定してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 認証状態の表示 */}
          {authStatus && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium dark:text-gray-200">
                    認証状態: {authStatus.authenticated ? (
                      <span className="text-green-600">認証済み</span>
                    ) : (
                      <span className="text-orange-600">未認証</span>
                    )}
                  </h3>
                  {authStatus.error && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{authStatus.error}</p>
                  )}
                  {authStatus.authenticated && authStatus.expiresAt && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      有効期限: {new Date(authStatus.expiresAt * 1000).toLocaleString()}
                    </p>
                  )}
                </div>
                {!authStatus.authenticated && (
                  <Button
                    onClick={handleTwitchAuth}
                    variant="default"
                    className="flex items-center space-x-2"
                  >
                    <Wifi className="w-4 h-4" />
                    <span>Twitchで認証</span>
                  </Button>
                )}
                {authStatus.authenticated && (
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleTokenRefresh}
                      variant="outline"
                      className="flex items-center space-x-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>トークンを更新</span>
                    </Button>
                    <Button
                      onClick={handleTwitchAuth}
                      variant="ghost"
                      className="flex items-center space-x-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>再認証</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID *</Label>
              <div className="relative">
                <Input
                  id="client_id"
                  type={showSecrets['CLIENT_ID'] ? "text" : "password"}
                  placeholder={settings['CLIENT_ID']?.has_value ? "（設定済み）" : "Twitch Client ID"}
                  value={unsavedChanges['CLIENT_ID'] !== undefined ? unsavedChanges['CLIENT_ID'] : getSettingValue('CLIENT_ID')}
                  onChange={(e) => handleSettingChange('CLIENT_ID', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && unsavedChanges['CLIENT_ID'] !== undefined) {
                      setUnsavedChanges(prev => {
                        const updated = { ...prev };
                        delete updated['CLIENT_ID'];
                        return updated;
                      });
                    }
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, CLIENT_ID: !prev.CLIENT_ID }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  {showSecrets['CLIENT_ID'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret *</Label>
              <div className="relative">
                <Input
                  id="client_secret"
                  type={showSecrets['CLIENT_SECRET'] ? "text" : "password"}
                  placeholder={settings['CLIENT_SECRET']?.has_value ? "（設定済み）" : "Twitch Client Secret"}
                  value={unsavedChanges['CLIENT_SECRET'] !== undefined ? unsavedChanges['CLIENT_SECRET'] : getSettingValue('CLIENT_SECRET')}
                  onChange={(e) => handleSettingChange('CLIENT_SECRET', e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, CLIENT_SECRET: !prev.CLIENT_SECRET }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  {showSecrets['CLIENT_SECRET'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_id">ユーザーID *</Label>
              <div className="relative">
                <Input
                  id="user_id"
                  type={showSecrets['TWITCH_USER_ID'] ? "text" : "password"}
                  placeholder={settings['TWITCH_USER_ID']?.has_value ? "（設定済み）" : "監視対象のTwitchユーザーID"}
                  value={unsavedChanges['TWITCH_USER_ID'] !== undefined ? unsavedChanges['TWITCH_USER_ID'] : getSettingValue('TWITCH_USER_ID')}
                  onChange={(e) => handleSettingChange('TWITCH_USER_ID', e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, TWITCH_USER_ID: !prev.TWITCH_USER_ID }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  {showSecrets['TWITCH_USER_ID'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* リワードグループ管理 */}
      <RewardGroupsManager
        onGroupsChanged={() => setRefreshTrigger(prev => prev + 1)}
      />

      {/* Custom Rewards一覧 */}
      <CustomRewardsList
        currentTriggerRewardId={getSettingValue('TRIGGER_CUSTOM_REWORD_ID')}
        onRewardSelect={(rewardId) => handleSettingChange('TRIGGER_CUSTOM_REWORD_ID', rewardId)}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
};