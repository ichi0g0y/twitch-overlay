/**
 * Message fragment (text or emote)
 */
export interface Fragment {
  type: 'text' | 'emote';
  text: string;
  emoteId?: string;
  emoteUrl?: string;
}

/**
 * Chat notification data
 */
export interface ChatNotification {
  username: string;
  message: string;
  fragments?: Fragment[];
  fontSize?: number;
  avatarUrl?: string;
}
