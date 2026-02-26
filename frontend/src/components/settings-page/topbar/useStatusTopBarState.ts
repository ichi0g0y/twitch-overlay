import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMicCaptionStatus } from '../../../contexts/MicCaptionStatusContext';
import { readIrcChannels, subscribeIrcChannels } from '../../../utils/chatChannels';
import {
  resolveWorkspaceMenuCategory,
  truncateText,
  WORKSPACE_MENU_CATEGORY_LABELS,
  WORKSPACE_MENU_CATEGORY_ORDER,
  type TopBarMenuItem,
  type WorkspaceMenuCategory,
} from './menu';

export const useStatusTopBarState = ({
  webServerPort,
  cardMenuItems,
}: {
  webServerPort?: number;
  cardMenuItems: TopBarMenuItem[];
}) => {
  const { status: micStatus } = useMicCaptionStatus();
  const [openPanel, setOpenPanel] = useState<'system' | 'mic' | null>(null);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [cardMenuHoveredCategory, setCardMenuHoveredCategory] =
    useState<WorkspaceMenuCategory>('preview');
  const [ircConnectedChannels, setIrcConnectedChannels] = useState<string[]>(
    () => readIrcChannels(),
  );

  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const micTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const micPanelRef = useRef<HTMLDivElement | null>(null);
  const cardMenuPanelRef = useRef<HTMLDivElement | null>(null);

  const interim = truncateText(micStatus.lastInterimText, 120);
  const finalText = truncateText(micStatus.lastFinalText, 120);
  const translatedText = truncateText(micStatus.lastTranslationText, 120);

  const resolvedWebServerPort = useMemo(() => {
    if (typeof webServerPort === 'number' && webServerPort > 0)
      return webServerPort;
    if (typeof window === 'undefined') return undefined;
    const port = window.location.port
      ? Number.parseInt(window.location.port, 10)
      : Number.NaN;
    return Number.isNaN(port) ? undefined : port;
  }, [webServerPort]);

  const cardMenuItemsByCategory = useMemo(() => {
    const grouped: Record<WorkspaceMenuCategory, TopBarMenuItem[]> = {
      preview: [],
      general: [],
      mic: [],
      twitch: [],
      printer: [],
      music: [],
      overlay: [],
      cache: [],
      system: [],
    };
    for (const item of cardMenuItems) {
      grouped[resolveWorkspaceMenuCategory(item.kind)].push(item);
    }
    return WORKSPACE_MENU_CATEGORY_ORDER.map((category) => ({
      category,
      label: WORKSPACE_MENU_CATEGORY_LABELS[category],
      items: grouped[category],
    })).filter((group) => group.items.length > 0);
  }, [cardMenuItems]);

  const activeCardMenuGroup = useMemo(
    () =>
      cardMenuItemsByCategory.find(
        (group) => group.category === cardMenuHoveredCategory,
      ) ?? cardMenuItemsByCategory[0],
    [cardMenuHoveredCategory, cardMenuItemsByCategory],
  );

  const normalizeCardMenuItemLabel = useCallback(
    (label: string) => label.replace(/^[^:：]+[:：]\s*/, ''),
    [],
  );

  useEffect(() => {
    if (!cardMenuOpen) return;
    if (cardMenuItemsByCategory.length === 0) return;
    if (
      cardMenuItemsByCategory.some(
        (group) => group.category === cardMenuHoveredCategory,
      )
    ) {
      return;
    }
    setCardMenuHoveredCategory(cardMenuItemsByCategory[0].category);
  }, [cardMenuHoveredCategory, cardMenuItemsByCategory, cardMenuOpen]);

  useEffect(() => {
    if (!openPanel) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (systemTriggerRef.current?.contains(target)) return;
      if (micTriggerRef.current?.contains(target)) return;
      if (cardMenuTriggerRef.current?.contains(target)) return;
      if (systemPanelRef.current?.contains(target)) return;
      if (micPanelRef.current?.contains(target)) return;
      if (cardMenuPanelRef.current?.contains(target)) return;
      setOpenPanel(null);
      setCardMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
        setCardMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!cardMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (cardMenuTriggerRef.current?.contains(target)) return;
      if (cardMenuPanelRef.current?.contains(target)) return;
      setCardMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCardMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [cardMenuOpen]);

  useEffect(() => {
    return subscribeIrcChannels((channels) => {
      setIrcConnectedChannels(channels);
    });
  }, []);

  const micStateLabel = !micStatus.speechSupported
    ? '非対応'
    : micStatus.recState === 'running'
      ? '実行中'
      : micStatus.recState === 'starting'
        ? '起動中'
        : '停止';

  return {
    micStatus,
    openPanel,
    setOpenPanel,
    cardMenuOpen,
    setCardMenuOpen,
    cardMenuHoveredCategory,
    setCardMenuHoveredCategory,
    ircConnectedChannels,
    systemTriggerRef,
    micTriggerRef,
    cardMenuTriggerRef,
    systemPanelRef,
    micPanelRef,
    cardMenuPanelRef,
    interim,
    finalText,
    translatedText,
    resolvedWebServerPort,
    cardMenuItemsByCategory,
    activeCardMenuGroup,
    normalizeCardMenuItemLabel,
    micStateLabel,
  };
};
