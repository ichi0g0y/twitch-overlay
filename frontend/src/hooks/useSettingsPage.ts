import { createContext } from 'react';
import { useSettingsPageController } from './settings-page/useSettingsPageController';

export const SettingsPageContext =
  createContext<ReturnType<typeof useSettingsPageController> | null>(null);

export const useSettingsPage = () => {
  return useSettingsPageController();
};
