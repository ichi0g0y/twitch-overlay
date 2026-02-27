import { useEffect, useMemo } from 'react';
import { PRIMARY_CHAT_TAB_ID, normalizeTwitchChannelName } from '../../utils/chatChannels';
import { getTwitchParentDomain } from '../../utils/twitchParentDomain';
import { isLoginLikeDisplayName } from './utils';

type DisplayTab = { id: string; label: string; title: string; removable: boolean };
type EmbedFrame = { tabId: string; channelLogin: string; src: string };

export const buildTabs = ({
  ircChannels,
  channelDisplayNames,
  tabDisplayNamesByChannel,
}: {
  ircChannels: string[];
  channelDisplayNames: Record<string, string>;
  tabDisplayNamesByChannel: Record<string, string>;
}): DisplayTab[] => ([
  { id: PRIMARY_CHAT_TAB_ID, label: 'メイン', title: 'メインチャンネル', removable: false },
  ...ircChannels.map((channel) => {
    const normalizedChannel = normalizeTwitchChannelName(channel) || channel;
    const presetDisplayName = (channelDisplayNames[channel] || channelDisplayNames[normalizedChannel] || '').trim();
    const cachedDisplayName = (tabDisplayNamesByChannel[channel] || tabDisplayNamesByChannel[normalizedChannel] || '').trim();
    const preferredPresetName = isLoginLikeDisplayName(presetDisplayName, normalizedChannel) ? '' : presetDisplayName;
    const preferredCachedName = isLoginLikeDisplayName(cachedDisplayName, normalizedChannel) ? '' : cachedDisplayName;
    const displayName = (preferredPresetName || preferredCachedName || presetDisplayName || cachedDisplayName).trim();
    return {
      id: channel,
      label: displayName || `#${normalizedChannel}`,
      title: displayName ? `${displayName} (#${normalizedChannel})` : `#${normalizedChannel}`,
      removable: true,
    };
  }),
]);

export const buildEmbedFrames = ({
  tabs,
  embedReloadNonceByTab,
  loadedEmbedTabIds,
  twitchParentDomain,
  resolveTabChannelLogin,
}: {
  tabs: DisplayTab[];
  embedReloadNonceByTab: Record<string, number>;
  loadedEmbedTabIds: Record<string, true>;
  twitchParentDomain: string;
  resolveTabChannelLogin: (tabId: string) => string;
}): EmbedFrame[] => tabs
  .filter((tab) => loadedEmbedTabIds[tab.id] === true)
  .map((tab) => {
    const channelLogin = resolveTabChannelLogin(tab.id);
    if (!channelLogin) return null;
    const reloadNonce = embedReloadNonceByTab[tab.id] ?? 0;
    return {
      tabId: tab.id,
      channelLogin,
      src: `https://www.twitch.tv/embed/${encodeURIComponent(channelLogin)}/chat?parent=${encodeURIComponent(twitchParentDomain)}&darkpopout&reload=${reloadNonce}`,
    };
  })
  .filter((frame): frame is EmbedFrame => frame !== null);

export const useAutoScrollActiveTabButton = ({
  activeTab,
  tabScroller,
  activeButton,
  tabs,
}: {
  activeTab: string;
  tabScroller: HTMLDivElement | null;
  activeButton: HTMLButtonElement | null;
  tabs: DisplayTab[];
}) => {
  useEffect(() => {
    if (!tabScroller || !activeButton) return;
    window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [activeButton, activeTab, tabScroller, tabs]);
};

export const useTabEmbedDisplayState = ({
  activeTab,
  ircChannels,
  channelDisplayNames,
  tabDisplayNamesByChannel,
  embedReloadNonceByTab,
  loadedEmbedTabIds,
  resolveTabChannelLogin,
  tabScroller,
  activeButton,
}: {
  activeTab: string;
  ircChannels: string[];
  channelDisplayNames: Record<string, string>;
  tabDisplayNamesByChannel: Record<string, string>;
  embedReloadNonceByTab: Record<string, number>;
  loadedEmbedTabIds: Record<string, true>;
  resolveTabChannelLogin: (tabId: string) => string;
  tabScroller: HTMLDivElement | null;
  activeButton: HTMLButtonElement | null;
}) => {
  const tabs = useMemo(
    () => buildTabs({ ircChannels, channelDisplayNames, tabDisplayNamesByChannel }),
    [channelDisplayNames, ircChannels, tabDisplayNamesByChannel],
  );
  const twitchParentDomain = useMemo(() => getTwitchParentDomain(), []);
  const embedFrames = useMemo(
    () => buildEmbedFrames({
      tabs,
      embedReloadNonceByTab,
      loadedEmbedTabIds,
      twitchParentDomain,
      resolveTabChannelLogin,
    }),
    [embedReloadNonceByTab, loadedEmbedTabIds, resolveTabChannelLogin, tabs, twitchParentDomain],
  );
  const activeEmbedFrame = useMemo(
    () => embedFrames.find((frame) => frame.tabId === activeTab) ?? null,
    [activeTab, embedFrames],
  );

  useAutoScrollActiveTabButton({ activeTab, tabScroller, activeButton, tabs });

  return {
    tabs,
    embedFrames,
    activeEmbedFrame,
  };
};
