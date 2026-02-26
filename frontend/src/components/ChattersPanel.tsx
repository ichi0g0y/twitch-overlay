import React, { useEffect } from 'react';
import { ChattersPanelContent } from './chatters-panel/ChattersPanelContent';
import { useChatters } from './chatters-panel/useChatters';
import { useHydratedProfiles } from './chatters-panel/useHydratedProfiles';
import type { ChattersPanelProps } from './chatters-panel/types';

export type { ChattersPanelChatter } from './chatters-panel/types';

export const ChattersPanel: React.FC<ChattersPanelProps> = ({
  open,
  channelLogin,
  fallbackChatters,
  onChatterClick,
  onClose,
}) => {
  const { loading, error, notice, chatterRows, headlineCount } = useChatters({
    open,
    channelLogin,
    fallbackChatters,
  });

  const {
    hydratedProfiles,
    hydratingProfileKeys,
    hydratingCount,
    listContainerRef,
    setRowRef,
  } = useHydratedProfiles({
    open,
    channelLogin,
    chatterRows,
  });

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <ChattersPanelContent
      open={open}
      headlineCount={headlineCount}
      loading={loading}
      error={error}
      notice={notice}
      hydratingCount={hydratingCount}
      chatterRows={chatterRows}
      hydratedProfiles={hydratedProfiles}
      hydratingProfileKeys={hydratingProfileKeys}
      listContainerRef={listContainerRef}
      setRowRef={setRowRef}
      onChatterClick={onChatterClick}
      onClose={onClose}
    />
  );
};
