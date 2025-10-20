import { Fragment } from '../../types/notification';

interface MessageContentProps {
  message: string;
  fragments?: Fragment[];
  fontSize?: number;
}

/**
 * MessageContent component
 * Renders message fragments with text and emotes
 */
export function MessageContent({ message, fragments, fontSize = 14 }: MessageContentProps) {
  // If no fragments provided, display plain text
  if (!fragments || fragments.length === 0) {
    return <span>{message}</span>;
  }

  // Calculate emote height based on font size (1.2x ratio)
  const emoteHeight = `${fontSize * 1.2}px`;

  // Render fragments (text + emotes)
  return (
    <>
      {fragments.map((fragment, index) => {
        if (fragment.type === 'emote' && fragment.emoteUrl) {
          return (
            <img
              key={index}
              src={fragment.emoteUrl}
              alt={fragment.text}
              className="inline align-middle mx-[0.1em]"
              style={{ height: emoteHeight }}
              title={fragment.text}
              loading="lazy"
            />
          );
        } else {
          return <span key={index}>{fragment.text}</span>;
        }
      })}
    </>
  );
}
