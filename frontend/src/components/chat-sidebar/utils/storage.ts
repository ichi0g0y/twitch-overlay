import { PRIMARY_CHAT_TAB_ID } from '../../../utils/chatChannels';
import type {
  ChatDisplayMode,
  ChatDisplayModeByTab,
  MessageOrderReversedByTab,
} from '../types';
import {
  ACTIVE_TAB_STORAGE_KEY,
  CHAT_DISPLAY_MODE_STORAGE_KEY,
  LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY,
  LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY,
  MESSAGE_ORDER_REVERSED_STORAGE_KEY,
} from './constants';

export const readStoredActiveTab = (): string => {
  if (typeof window === 'undefined') return PRIMARY_CHAT_TAB_ID;
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored && stored.trim() !== '' ? stored : PRIMARY_CHAT_TAB_ID;
};

export const readStoredMessageOrderReversedByTab = (): MessageOrderReversedByTab => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(MESSAGE_ORDER_REVERSED_STORAGE_KEY);
  if (raw && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalized: MessageOrderReversedByTab = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key === 'string' && key.trim() !== '' && value === true) {
            normalized[key] = true;
          }
        }
        return normalized;
      }
    } catch {
      // ignore malformed payload and fall back to legacy key
    }
  }

  if (window.localStorage.getItem(LEGACY_MESSAGE_ORDER_REVERSED_STORAGE_KEY) === 'true') {
    return { [PRIMARY_CHAT_TAB_ID]: true };
  }
  return {};
};

export const resolveDefaultChatDisplayMode = (tabId: string): ChatDisplayMode => {
  return tabId === PRIMARY_CHAT_TAB_ID ? 'custom' : 'embed';
};

export const readStoredChatDisplayModeByTab = (): ChatDisplayModeByTab => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(CHAT_DISPLAY_MODE_STORAGE_KEY);
  if (raw && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalized: ChatDisplayModeByTab = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof key !== 'string' || key.trim() === '') continue;
          if (value === 'custom' || value === 'embed') {
            normalized[key] = value;
          }
        }
        return normalized;
      }
    } catch {
      // ignore malformed payload and fall back
    }
  }

  const legacy = window.localStorage.getItem(LEGACY_CHAT_DISPLAY_MODE_STORAGE_KEY);
  if (legacy === 'custom' || legacy === 'embed') {
    return { [PRIMARY_CHAT_TAB_ID]: legacy };
  }
  return {};
};
