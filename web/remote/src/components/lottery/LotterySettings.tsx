import React from 'react';
import { useRemote } from '../../contexts/RemoteContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { ChevronUp, ChevronDown, Gift } from 'lucide-react';

interface LotterySettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const LotterySettings: React.FC<LotterySettingsProps> = ({ isExpanded, onToggle }) => {
  const { overlaySettings, updateOverlaySettings, customRewards, authStatus } = useRemote();

  return (
    <Card className="break-inside-avoid mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              プレゼントルーレット
            </CardTitle>
            <CardDescription>
              チャンネルポイントリワードを使った抽選機能の設定
            </CardDescription>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* LOTTERY_ENABLEDは廃止され、常に有効として扱われます */}
          <div className="space-y-2">
            <Label htmlFor="lottery-reward">抽選対象リワード</Label>
            {customRewards.length > 0 ? (
              <Select
                value={overlaySettings?.lottery_reward_id || ''}
                onValueChange={(value) =>
                  updateOverlaySettings({
                    lottery_reward_id: value || null
                  })
                }
              >
                <SelectTrigger id="lottery-reward">
                  <SelectValue placeholder="リワードを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {customRewards.map(reward => (
                    <SelectItem key={reward.id} value={reward.id}>
                      {reward.title} ({reward.cost}pt)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-500 dark:text-gray-400">
                {authStatus?.authenticated
                  ? 'リワードを読み込み中...'
                  : 'Twitchタブで認証してください'}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              このリワードを使用したユーザーが抽選対象になります
            </p>
          </div>

          {/* ティッカー表示設定 */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="lottery-ticker">オーバーレイでティッカー表示</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                参加者を画面最下部に横スクロール表示します
              </p>
            </div>
            <Switch
              id="lottery-ticker"
              checked={overlaySettings?.lottery_ticker_enabled || false}
              onCheckedChange={(checked) =>
                updateOverlaySettings({ lottery_ticker_enabled: checked })
              }
            />
          </div>

          {/* お知らせ文設定 */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">お知らせ文設定</h4>

            {/* 有効/無効スイッチ */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ticker-notice">お知らせ文を表示</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ティッカーの上にお知らせ文を表示します
                </p>
              </div>
              <Switch
                id="ticker-notice"
                checked={overlaySettings?.ticker_notice_enabled || false}
                onCheckedChange={(checked) =>
                  updateOverlaySettings({ ticker_notice_enabled: checked })
                }
              />
            </div>

            {/* お知らせ文の内容 */}
            {overlaySettings?.ticker_notice_enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ticker-notice-text">お知らせ文</Label>
                  <Input
                    id="ticker-notice-text"
                    value={overlaySettings?.ticker_notice_text || ''}
                    onChange={(e) =>
                      updateOverlaySettings({ ticker_notice_text: e.target.value })
                    }
                    placeholder="お知らせ文を入力..."
                  />
                </div>

                {/* フォントサイズ */}
                <div className="space-y-2">
                  <Label htmlFor="ticker-notice-font-size">
                    フォントサイズ (10-48px)
                  </Label>
                  <Input
                    id="ticker-notice-font-size"
                    type="number"
                    min={10}
                    max={48}
                    value={overlaySettings?.ticker_notice_font_size || 16}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (value >= 10 && value <= 48) {
                        updateOverlaySettings({ ticker_notice_font_size: value });
                      }
                    }}
                  />
                </div>

                {/* 配置 */}
                <div className="space-y-2">
                  <Label htmlFor="ticker-notice-align">配置</Label>
                  <Select
                    value={overlaySettings?.ticker_notice_align || 'center'}
                    onValueChange={(value) =>
                      updateOverlaySettings({ ticker_notice_align: value })
                    }
                  >
                    <SelectTrigger id="ticker-notice-align">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">左寄せ</SelectItem>
                      <SelectItem value="center">中央</SelectItem>
                      <SelectItem value="right">右寄せ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
