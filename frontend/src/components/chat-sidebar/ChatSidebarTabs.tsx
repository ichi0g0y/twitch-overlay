import React from 'react';
import { X } from 'lucide-react';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import { Button } from '../ui/button';

type SidebarTab = {
  id: string;
  label: string;
  title: string;
  removable: boolean;
};

export const ChatSidebarTabs: React.FC<{
  tabScrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  tabButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  tabs: SidebarTab[];
  activeTab: string;
  connectingChannels: Record<string, boolean>;
  channelEditorOpen: boolean;
  channelInput: string;
  channelInputError: string;
  setActiveTab: (tabId: string) => void;
  handleRemoveChannel: (channel: string) => void;
  setChannelInput: React.Dispatch<React.SetStateAction<string>>;
  setChannelInputError: React.Dispatch<React.SetStateAction<string>>;
  handleAddChannel: () => void;
}> = ({
  tabScrollerRef,
  tabButtonRefs,
  tabs,
  activeTab,
  connectingChannels,
  channelEditorOpen,
  channelInput,
  channelInputError,
  setActiveTab,
  handleRemoveChannel,
  setChannelInput,
  setChannelInputError,
  handleAddChannel,
}) => {
  return (
    <div className="border-b dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80 px-2 py-1">
      <div ref={tabScrollerRef} className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isConnecting = tab.id !== PRIMARY_CHAT_TAB_ID && connectingChannels[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.title}
              ref={(node) => {
                tabButtonRefs.current[tab.id] = node;
              }}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs whitespace-nowrap transition ${
                isActive
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/20 dark:text-blue-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {tab.id !== PRIMARY_CHAT_TAB_ID && (
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              )}
              <span>{tab.label}</span>
              {tab.removable && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveChannel(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemoveChannel(tab.id);
                    }
                  }}
                  className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-gray-600"
                  aria-label={`#${tab.id} を削除`}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {channelEditorOpen && (
        <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(event) => {
                setChannelInput(event.target.value);
                if (channelInputError) {
                  setChannelInputError('');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  handleAddChannel();
                }
              }}
              placeholder="追加するチャンネル名"
              className="flex-1 h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs"
            />
            <Button type="button" size="sm" className="h-8 px-2" onClick={handleAddChannel}>
              追加
            </Button>
          </div>
          {channelInputError && <p className="mt-1 text-[11px] text-red-500">{channelInputError}</p>}
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Twitch認証が有効ならユーザー接続し、利用できない場合は匿名接続します
          </p>
        </div>
      )}
    </div>
  );
};
