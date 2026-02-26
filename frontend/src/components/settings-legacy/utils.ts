export const FONT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export const isAllowedFontFile = (name: string): boolean => {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'ttf' || ext === 'otf';
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
