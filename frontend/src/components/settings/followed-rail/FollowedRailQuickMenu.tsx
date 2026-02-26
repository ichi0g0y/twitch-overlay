import { Gift, Layers, Menu } from 'lucide-react';
import React from 'react';

interface FollowedRailQuickMenuProps {
  side: 'left' | 'right';
  railMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSideChange: (side: 'left' | 'right') => void;
  onOpenOverlay: () => void;
  onOpenOverlayDebug: () => void;
  onOpenPresent: () => void;
  onOpenPresentDebug: () => void;
}

export const FollowedRailQuickMenu: React.FC<FollowedRailQuickMenuProps> = ({
  side,
  railMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onSideChange,
  onOpenOverlay,
  onOpenOverlayDebug,
  onOpenPresent,
  onOpenPresentDebug,
}) => {
  const toggleLabel = side === 'left' ? '右側へ移動' : '左側へ移動';

  return (
    <div className="relative mb-2">
      <button
        type="button"
        data-rail-trigger="true"
        onClick={onToggleMenu}
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
        aria-label="クイック操作メニュー"
        aria-expanded={railMenuOpen}
      >
        <Menu className="h-4 w-4" />
      </button>

      {railMenuOpen && (
        <div
          data-rail-menu="true"
          className={`absolute top-0 z-50 w-56 rounded-md border border-gray-700 bg-gray-900/95 p-2 shadow-xl ${
            side === 'left' ? 'left-full ml-2' : 'right-full mr-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onSideChange(side === 'left' ? 'right' : 'left');
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            {toggleLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenOverlay();
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            <Layers className="h-3.5 w-3.5 text-gray-300" />
            <span>オーバーレイ表示</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenOverlayDebug();
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            <Layers className="h-3.5 w-3.5 text-gray-300" />
            <span>オーバーレイ表示(デバッグ)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenPresent();
              onCloseMenu();
            }}
            className="mb-1 inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            <Gift className="h-3.5 w-3.5 text-gray-300" />
            <span>プレゼントルーレット</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenPresentDebug();
              onCloseMenu();
            }}
            className="inline-flex h-8 w-full items-center gap-2 rounded border border-gray-700 px-2 text-left text-xs text-gray-200 hover:bg-gray-800"
          >
            <Gift className="h-3.5 w-3.5 text-gray-300" />
            <span>プレゼント(デバッグ)</span>
          </button>
        </div>
      )}
    </div>
  );
};
