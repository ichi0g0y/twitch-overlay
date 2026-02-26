import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeTwitchChannelName } from '../../utils/chatChannels';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import type { BadgeVisual, IvrBadgeSet } from './types';
import {
  IVR_BADGES_CHANNEL_ENDPOINT,
  IVR_BADGES_GLOBAL_ENDPOINT,
} from './utils';

export const useIrcBadges = ({
  activeTab,
  primaryChannelLogin,
}: {
  activeTab: string;
  primaryChannelLogin: string;
}) => {
  const globalBadgeCatalogRef = useRef<Map<string, BadgeVisual>>(new Map());
  const channelBadgeCatalogRef = useRef<Record<string, Map<string, BadgeVisual>>>({});
  const badgeCatalogInFlightRef = useRef<Set<string>>(new Set());
  const [badgeCatalogVersion, setBadgeCatalogVersion] = useState(0);

  const activeBadgeChannelLogin = useMemo(() => {
    if (activeTab === PRIMARY_CHAT_TAB_ID) {
      return normalizeTwitchChannelName(primaryChannelLogin || '') || '';
    }
    return normalizeTwitchChannelName(activeTab || '') || '';
  }, [activeTab, primaryChannelLogin]);

  const buildBadgeCatalog = useCallback((sets: IvrBadgeSet[]) => {
    const catalog = new Map<string, BadgeVisual>();
    for (const set of sets) {
      const setId = (set?.set_id || '').trim().toLowerCase();
      if (setId === '') continue;
      const versions = Array.isArray(set?.versions) ? set.versions : [];
      for (const version of versions) {
        const versionId = (version?.id || '').trim();
        if (versionId === '') continue;
        const imageUrl = (version?.image_url_2x || version?.image_url_4x || version?.image_url_1x || '').trim();
        const title = (version?.title || '').trim();
        const description = (version?.description || '').trim();
        const label = description !== '' ? `${title || setId}: ${description}` : (title || setId);
        catalog.set(`${setId}/${versionId}`, { imageUrl, label });
      }
    }
    return catalog;
  }, []);

  const ensureBadgeCatalog = useCallback(async (channelLogin?: string) => {
    const loadCatalog = async (cacheKey: string, url: string, onSuccess: (catalog: Map<string, BadgeVisual>) => void) => {
      if (badgeCatalogInFlightRef.current.has(cacheKey)) return;
      badgeCatalogInFlightRef.current.add(cacheKey);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const sets = Array.isArray(payload) ? payload as IvrBadgeSet[] : [];
        const catalog = buildBadgeCatalog(sets);
        onSuccess(catalog);
        setBadgeCatalogVersion((v) => v + 1);
      } catch (error) {
        console.warn('[ChatSidebar] Failed to load badge catalog:', error);
      } finally {
        badgeCatalogInFlightRef.current.delete(cacheKey);
      }
    };

    if (globalBadgeCatalogRef.current.size === 0) {
      void loadCatalog('global', IVR_BADGES_GLOBAL_ENDPOINT, (catalog) => {
        globalBadgeCatalogRef.current = catalog;
      });
    }

    const normalizedChannel = normalizeTwitchChannelName(channelLogin || '') || '';
    if (normalizedChannel !== '' && !channelBadgeCatalogRef.current[normalizedChannel]) {
      const url = `${IVR_BADGES_CHANNEL_ENDPOINT}?login=${encodeURIComponent(normalizedChannel)}`;
      void loadCatalog(`channel:${normalizedChannel}`, url, (catalog) => {
        channelBadgeCatalogRef.current[normalizedChannel] = catalog;
      });
    }
  }, [buildBadgeCatalog]);

  useEffect(() => {
    void ensureBadgeCatalog(activeBadgeChannelLogin);
  }, [activeBadgeChannelLogin, ensureBadgeCatalog]);

  const resolveBadgeVisual = useCallback((badgeKey: string): BadgeVisual | null => {
    const raw = (badgeKey || '').trim();
    if (raw === '') return null;
    const [setIdRaw, versionRaw = ''] = raw.split('/');
    const setId = setIdRaw.trim().toLowerCase();
    const version = versionRaw.trim();
    if (setId === '') return null;
    const resolvedKey = version !== '' ? `${setId}/${version}` : '';
    const channelCatalog = activeBadgeChannelLogin ? channelBadgeCatalogRef.current[activeBadgeChannelLogin] : undefined;
    const matched = (resolvedKey !== '' ? channelCatalog?.get(resolvedKey) : undefined)
      ?? (resolvedKey !== '' ? globalBadgeCatalogRef.current.get(resolvedKey) : undefined);
    if (matched) return matched;
    return {
      imageUrl: '',
      label: version !== '' ? `${setIdRaw} ${version}` : setIdRaw,
    };
  }, [activeBadgeChannelLogin, badgeCatalogVersion]);

  return {
    activeBadgeChannelLogin,
    resolveBadgeVisual,
  };
};
