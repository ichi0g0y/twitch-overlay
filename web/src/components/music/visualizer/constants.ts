export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const BAR_COUNT = 32;
export const DOT_LEVELS = 3;
export const DOT_SIZE = 3;
export const DOT_GAP = 3;
export const RADIUS = 55;

export const DEFAULT_COLOR: RgbColor = { r: 255, g: 179, b: 186 };
export const OPACITY_LEVELS = [0.4, 0.3, 0.2];

export const THRESHOLD_LOW = 0.2;
export const THRESHOLD_MID = 0.5;
export const THRESHOLD_HIGH = 0.75;
