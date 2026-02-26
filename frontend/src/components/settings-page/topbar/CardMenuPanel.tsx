import React from 'react';
import type { TopBarMenuItem, WorkspaceMenuCategory } from './menu';

type GroupedMenu = {
  category: WorkspaceMenuCategory;
  label: string;
  items: TopBarMenuItem[];
};

type CardMenuPanelProps = {
  cardMenuItemsByCategory: GroupedMenu[];
  activeCardMenuGroup?: GroupedMenu;
  canAddCard: (kind: any) => boolean;
  onAddCard: (kind: any) => void;
  normalizeCardMenuItemLabel: (label: string) => string;
  setCardMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCardMenuHoveredCategory: React.Dispatch<React.SetStateAction<WorkspaceMenuCategory>>;
  ircConnectedChannels: string[];
  ircChannelDisplayNames: Record<string, string>;
  onAddIrcPreview: (channelLogin: string) => void;
};

export const CardMenuPanel: React.FC<CardMenuPanelProps> = ({
  cardMenuItemsByCategory,
  activeCardMenuGroup,
  canAddCard,
  onAddCard,
  normalizeCardMenuItemLabel,
  setCardMenuOpen,
  setCardMenuHoveredCategory,
  ircConnectedChannels,
  ircChannelDisplayNames,
  onAddIrcPreview,
}) => {
  return (
    <div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-[34rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl">
      <div className="mb-1 px-1 text-[11px] text-gray-400">作業領域へ追加</div>
      <div className="flex gap-2">
        <div className="w-28 shrink-0 space-y-1">
          {cardMenuItemsByCategory.map((group) => {
            const isActive = activeCardMenuGroup?.category === group.category;
            return (
              <button
                key={group.category}
                type="button"
                onMouseEnter={() => setCardMenuHoveredCategory(group.category)}
                onFocus={() => setCardMenuHoveredCategory(group.category)}
                onClick={() => setCardMenuHoveredCategory(group.category)}
                className={`flex h-8 w-full items-center justify-between rounded border px-2 text-left text-xs transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                    : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="truncate">{group.label}</span>
                <span className="text-[10px] text-gray-400">▶</span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 rounded border border-gray-700/80 bg-black/10 p-1">
          <div className="mb-1 px-1 text-[11px] text-gray-400">{activeCardMenuGroup?.label ?? '-'}</div>
          <div className="space-y-1">
            {(activeCardMenuGroup?.items ?? []).map((item) => (
              <button
                key={item.kind}
                type="button"
                disabled={!canAddCard(item.kind)}
                onClick={() => {
                  if (!canAddCard(item.kind)) return;
                  onAddCard(item.kind);
                  setCardMenuOpen(false);
                }}
                className="flex w-full items-start rounded border border-gray-700 px-2 py-1.5 text-left hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div>
                  <div className="text-xs text-gray-100">
                    {normalizeCardMenuItemLabel(item.label)}
                    {!canAddCard(item.kind) ? ' (配置済み)' : ''}
                  </div>
                  <div className="text-[11px] text-gray-400">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 border-t border-gray-700 pt-2">
        <div className="mb-1 px-1 text-[11px] text-gray-400">コメント欄接続中から追加</div>
        <div className="space-y-1">
          {ircConnectedChannels.length === 0 && (
            <div className="px-1 text-[11px] text-gray-500">接続中のIRCチャンネルはありません</div>
          )}
          {ircConnectedChannels.map((channel) => {
            const disabled = !canAddCard(`preview-irc:${channel}`);
            const displayName = (ircChannelDisplayNames[channel] || '').trim();
            return (
              <button
                key={channel}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onAddIrcPreview(channel);
                  setCardMenuOpen(false);
                }}
                className="flex h-8 w-full items-center justify-between rounded border border-gray-700 px-2 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="truncate text-left">
                  {displayName ? `${displayName} (#${channel})` : `#${channel}`}
                </span>
                <span className="text-[11px] text-gray-400">{disabled ? '配置済み' : '追加'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
