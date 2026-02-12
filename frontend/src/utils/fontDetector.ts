const TEST_STRING = 'ABCDabcd12345あいうえお漢字テスト';
const BASELINE_FONT = 'monospace';
const PROBE_SIZE = '48px';

const CANDIDATE_FONTS: string[] = [
  'Noto Sans JP', 'Noto Serif JP', 'Meiryo', 'Yu Gothic', 'Yu Gothic UI',
  'Yu Mincho', 'MS Gothic', 'MS Mincho', 'MS PGothic', 'MS PMincho',
  'BIZ UDGothic', 'BIZ UDPGothic', 'BIZ UDMincho', 'BIZ UDPMincho',
  'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Hiragino Mincho ProN',
  'Osaka', 'Tsukushi A Round Gothic', 'Tsukushi B Round Gothic',
  'Klee', 'Toppan Bunkyu Gothic', 'Toppan Bunkyu Midashi Gothic',
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Georgia',
  'Verdana', 'Trebuchet MS', 'Courier New', 'Consolas',
  'Lucida Console', 'Tahoma', 'Impact', 'Comic Sans MS',
  'Segoe UI', 'Roboto', 'SF Pro Display', 'SF Pro Text',
  'SF Mono', 'Menlo', 'Monaco', '.AppleSystemUIFont',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Fira Code',
  'Malgun Gothic', 'Gulim', 'Batang',
  'SimHei', 'SimSun', 'Microsoft YaHei',
  'PingFang SC', 'PingFang TC', 'Apple SD Gothic Neo',
  'Source Han Sans', 'Source Han Serif',
];

let cachedFonts: string[] | null = null;
let cachedViaLocalFonts = false;

type FontListener = (fonts: string[]) => void;
const listeners = new Set<FontListener>();

function notifyListeners(fonts: string[]): void {
  for (const fn of listeners) fn(fonts);
}

/** Subscribe to font list updates. Returns unsubscribe function. */
export function onFontsUpdated(fn: FontListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Canvas API fallback: compare text width against monospace baseline */
function probeAvailableFonts(): string[] {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(1, 1)
    : document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return [];

  ctx.font = `${PROBE_SIZE} ${BASELINE_FONT}`;
  const baseWidth = ctx.measureText(TEST_STRING).width;

  const available: string[] = [];
  for (const font of CANDIDATE_FONTS) {
    ctx.font = `${PROBE_SIZE} "${font}", ${BASELINE_FONT}`;
    if (ctx.measureText(TEST_STRING).width !== baseWidth) {
      available.push(font);
    }
  }
  return available;
}

/** Chrome 103+ Local Font Access API: enumerate all installed fonts */
async function queryLocalFontsIfAvailable(): Promise<string[] | null> {
  const queryFn = (window as any).queryLocalFonts;
  if (typeof queryFn !== 'function') return null;

  try {
    const fonts: Array<{ family: string }> = await queryFn();
    const families = new Set<string>();
    for (const f of fonts) {
      if (f.family) families.add(f.family);
    }
    const sorted = [...families].sort((a, b) => a.localeCompare(b, 'ja'));
    return sorted;
  } catch {
    return null;
  }
}

/**
 * Detect system fonts. Tries queryLocalFonts() first (Chrome 103+, exact list),
 * falls back to Canvas API probing (approximate, candidate list only).
 */
export async function detectSystemFontsAsync(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  const localFonts = await queryLocalFontsIfAvailable();
  if (localFonts && localFonts.length > 0) {
    cachedFonts = localFonts;
    cachedViaLocalFonts = true;
    return cachedFonts;
  }
  cachedFonts = probeAvailableFonts();
  cachedViaLocalFonts = false;
  return cachedFonts;
}

/**
 * Re-detect fonts using queryLocalFonts() if the cache was from Canvas probe.
 * Must be called from a user gesture context (click/focus) for permission.
 * Returns null if already using queryLocalFonts cache (no upgrade needed).
 */
export async function upgradeToLocalFontsIfNeeded(): Promise<string[] | null> {
  if (cachedViaLocalFonts) return null;
  const localFonts = await queryLocalFontsIfAvailable();
  if (localFonts && localFonts.length > 0) {
    cachedFonts = localFonts;
    cachedViaLocalFonts = true;
    notifyListeners(cachedFonts);
    return cachedFonts;
  }
  return null;
}

/** Synchronous fallback (Canvas probe only). Used if async is not suitable. */
export function detectSystemFonts(): string[] {
  if (cachedFonts) return cachedFonts;
  cachedFonts = probeAvailableFonts();
  return cachedFonts;
}

export function getCachedSystemFonts(): string[] | null {
  return cachedFonts;
}

export function clearFontCache(): void {
  cachedFonts = null;
}
