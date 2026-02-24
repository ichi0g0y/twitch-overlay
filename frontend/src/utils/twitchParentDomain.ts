export const getTwitchParentDomain = (): string => {
  if (typeof window === 'undefined') {
    return 'localhost';
  }
  return window.location.hostname?.replace(/^tauri\./, '') || 'localhost';
};
