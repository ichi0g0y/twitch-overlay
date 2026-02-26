import { Gift } from 'lucide-react';
import React from 'react';

import { LotteryHistory } from '../lottery/LotteryHistory';
import { LotteryRuleDisplay } from '../lottery/LotteryRuleDisplay';
import { LotterySettings } from '../lottery/LotterySettings';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { OverlayCardFrame } from './OverlayCardFrame';
import type { ColumnKey, OverlayCardKey } from './types';

interface LotteryCardProps {
  column: ColumnKey;
  focusCard?: OverlayCardKey;
  draggingCard: OverlayCardKey | null;
  onDragStart: (cardKey: OverlayCardKey, column: ColumnKey) => (event: React.DragEvent) => void;
  onDragEnd: () => void;
  preview?: boolean;
  overlaySettings: any;
  updateOverlaySettings: (updates: Record<string, unknown>) => Promise<void>;
  lottery: {
    customRewards: Array<{ id: string; title: string; cost: number }>;
    lotterySettingsState: any;
    lotteryHistory: any[];
    lotteryRuntimeState: any;
    lotteryBaseLimitInput: number;
    lotteryFinalLimitInput: number;
    isLotteryLoading: boolean;
    isLotteryDrawing: boolean;
    isLotterySaving: boolean;
    isLotteryResettingWinner: boolean;
    isRefreshingSubscribers: boolean;
    subscriberWarning: string | null;
    lotteryStatusMessage: string;
    setLotteryBaseLimitInput: (value: number) => void;
    setLotteryFinalLimitInput: (value: number) => void;
    fetchLotteryOverview: () => Promise<void>;
    syncLotteryRewardSetting: (rewardId: string | null) => Promise<void>;
    handleLotteryDraw: () => Promise<void>;
    handleLotteryResetWinner: () => Promise<void>;
    handleRefreshSubscribers: () => Promise<void>;
    handleSaveLotteryLimits: () => Promise<void>;
    handleDeleteLotteryHistory: (id: number) => Promise<void>;
    setLotteryStatusMessage: (value: string) => void;
  };
  isAuthenticated: boolean;
}

export const LotteryCard: React.FC<LotteryCardProps> = ({
  column,
  focusCard,
  draggingCard,
  onDragStart,
  onDragEnd,
  preview,
  overlaySettings,
  updateOverlaySettings,
  lottery,
  isAuthenticated,
}) => {
  return (
    <OverlayCardFrame
      panelId="settings.overlay.lottery"
      cardKey="lottery"
      column={column}
      focusCard={focusCard}
      draggingCard={draggingCard}
      preview={preview}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={(
        <span className="flex items-center gap-2">
          <Gift className="w-4 h-4" />
          プレゼントルーレット
        </span>
      )}
      description="チャンネルポイントリワードを使った抽選機能の設定"
    >
      <LotterySettings
        isLoading={lottery.isLotteryLoading}
        runtimeState={lottery.lotteryRuntimeState}
        onRefreshOverview={lottery.fetchLotteryOverview}
        rewardOptions={lottery.customRewards}
        rewardId={overlaySettings?.lottery_reward_id || lottery.lotterySettingsState?.reward_id || ''}
        isAuthenticated={isAuthenticated}
        onRewardChange={async (value) => {
          const rewardId = value || null;
          try {
            await updateOverlaySettings({ lottery_reward_id: rewardId });
            await lottery.syncLotteryRewardSetting(rewardId);
            lottery.setLotteryStatusMessage('抽選対象リワードを更新しました');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            alert(`抽選対象リワードの更新に失敗しました: ${message}`);
          }
        }}
        onDraw={lottery.handleLotteryDraw}
        isDrawing={lottery.isLotteryDrawing}
        onResetWinner={lottery.handleLotteryResetWinner}
        isResettingWinner={lottery.isLotteryResettingWinner}
        onRefreshSubscribers={lottery.handleRefreshSubscribers}
        isRefreshingSubscribers={lottery.isRefreshingSubscribers}
        subscriberWarning={lottery.subscriberWarning}
        lastWinner={lottery.lotterySettingsState?.last_winner || ''}
        baseLimit={lottery.lotteryBaseLimitInput}
        finalLimit={lottery.lotteryFinalLimitInput}
        onBaseLimitChange={lottery.setLotteryBaseLimitInput}
        onFinalLimitChange={lottery.setLotteryFinalLimitInput}
        onSaveLimits={lottery.handleSaveLotteryLimits}
        isSaving={lottery.isLotterySaving}
        statusMessage={lottery.lotteryStatusMessage}
      />

      <LotteryHistory
        history={lottery.lotteryHistory}
        onDelete={lottery.handleDeleteLotteryHistory}
      />

      <LotteryRuleDisplay />

      <div className="flex items-center justify-between space-x-2 pt-4 border-t">
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

      <div className="space-y-4 pt-4 border-t">
        <h4 className="text-sm font-medium">お知らせ文設定</h4>

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

            <div className="space-y-2">
              <Label htmlFor="ticker-notice-font-size">フォントサイズ (10-48px)</Label>
              <Input
                id="ticker-notice-font-size"
                type="number"
                min={10}
                max={48}
                value={overlaySettings?.ticker_notice_font_size || 16}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (value >= 10 && value <= 48) {
                    updateOverlaySettings({ ticker_notice_font_size: value });
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticker-notice-align">配置</Label>
              <Select
                value={overlaySettings?.ticker_notice_align || 'center'}
                onValueChange={(value) => {
                  if (value === 'left' || value === 'center' || value === 'right') {
                    updateOverlaySettings({ ticker_notice_align: value });
                  }
                }}
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
    </OverlayCardFrame>
  );
};
