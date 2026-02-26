import {
  useChatSidebarChannelEffects,
  useChatSidebarDisplayNameEffects,
  useChatSidebarMenuEffects,
  useChatSidebarModeEffects,
  useChatSidebarPersistenceEffects,
  useChatSidebarPopupEffects,
} from './useChatSidebarLifecycleEffects.effects';
import type { UseChatSidebarLifecycleEffectsParams } from './useChatSidebarLifecycleEffects.types';

export const useChatSidebarLifecycleEffects = (
  params: UseChatSidebarLifecycleEffectsParams,
) => {
  useChatSidebarMenuEffects(params);
  useChatSidebarChannelEffects(params);
  useChatSidebarPersistenceEffects(params);
  useChatSidebarPopupEffects(params);
  useChatSidebarModeEffects(params);
  useChatSidebarDisplayNameEffects(params);
};
