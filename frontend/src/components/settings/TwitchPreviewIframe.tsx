import React, { useMemo } from 'react';
import { getTwitchParentDomain } from '../../utils/twitchParentDomain';

type TwitchPreviewIframeProps = {
  channelLogin: string;
};

export const TwitchPreviewIframe: React.FC<TwitchPreviewIframeProps> = ({ channelLogin }) => {
  const normalizedChannel = channelLogin.trim();
  const parentDomain = useMemo(() => getTwitchParentDomain(), []);

  if (!normalizedChannel) {
    return null;
  }

  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(normalizedChannel)}&parent=${encodeURIComponent(parentDomain)}&muted=true&autoplay=true`;

  return (
    <div className="mb-2 overflow-hidden rounded border border-gray-700 bg-black">
      <div className="aspect-video w-full">
        <iframe
          src={src}
          title={`${normalizedChannel} のライブプレビュー`}
          className="h-full w-full border-0"
          allow="autoplay; encrypted-media; fullscreen"
        />
      </div>
    </div>
  );
};
