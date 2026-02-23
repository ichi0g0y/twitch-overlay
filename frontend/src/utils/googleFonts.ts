export type GoogleFontEntry = {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
};

export const GOOGLE_FONTS_LIST: GoogleFontEntry[] = [
  // Sans-serif
  { family: 'Noto Sans JP', category: 'sans-serif' },
  { family: 'M PLUS 1p', category: 'sans-serif' },
  { family: 'M PLUS Rounded 1c', category: 'sans-serif' },
  { family: 'Kosugi', category: 'sans-serif' },
  { family: 'Kosugi Maru', category: 'sans-serif' },
  { family: 'Sawarabi Gothic', category: 'sans-serif' },
  { family: 'Zen Kaku Gothic New', category: 'sans-serif' },
  { family: 'Zen Maru Gothic', category: 'sans-serif' },
  { family: 'M PLUS 1', category: 'sans-serif' },
  { family: 'M PLUS 2', category: 'sans-serif' },
  { family: 'BIZ UDPGothic', category: 'sans-serif' },
  // Serif
  { family: 'Noto Serif JP', category: 'serif' },
  { family: 'Sawarabi Mincho', category: 'serif' },
  { family: 'Zen Antique', category: 'serif' },
  { family: 'Zen Old Mincho', category: 'serif' },
  { family: 'BIZ UDPMincho', category: 'serif' },
  { family: 'Shippori Mincho', category: 'serif' },
  // Display / Decorative
  { family: 'Hachi Maru Pop', category: 'display' },
  { family: 'Yusei Magic', category: 'display' },
  { family: 'Reggae One', category: 'display' },
  { family: 'RocknRoll One', category: 'display' },
  { family: 'Train One', category: 'display' },
  { family: 'DotGothic16', category: 'display' },
  { family: 'Potta One', category: 'display' },
  { family: 'Rampart One', category: 'display' },
  { family: 'Stick', category: 'display' },
  { family: 'Dela Gothic One', category: 'display' },
  { family: 'Russo One', category: 'display' },
  // Handwriting
  { family: 'Klee One', category: 'handwriting' },
  { family: 'Yomogi', category: 'handwriting' },
  { family: 'Zen Kurenaido', category: 'handwriting' },
  { family: 'Kaisei Decol', category: 'handwriting' },
];

const GOOGLE_FONT_FAMILIES = new Set(GOOGLE_FONTS_LIST.map((f) => f.family));
const NO_WEIGHT_AXIS_FAMILIES = new Set<string>([
  'Russo One',
]);

const loadedFonts = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();

function buildGoogleFontsUrl(families: string[]): string {
  const params = families
    .map((family) => {
      const encodedFamily = encodeURIComponent(family);
      if (NO_WEIGHT_AXIS_FAMILIES.has(family)) {
        return `family=${encodedFamily}`;
      }
      return `family=${encodedFamily}:wght@100..900`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

function injectLink(url: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  return link;
}

export function isGoogleFont(family: string): boolean {
  return GOOGLE_FONT_FAMILIES.has(family);
}

export function isGoogleFontLoaded(family: string): boolean {
  return loadedFonts.has(family);
}

export async function loadGoogleFont(family: string): Promise<void> {
  if (loadedFonts.has(family)) return;
  const inflight = loadingFonts.get(family);
  if (inflight) return inflight;

  const promise = (async () => {
    injectLink(buildGoogleFontsUrl([family]));
    await document.fonts.ready;
    loadedFonts.add(family);
    loadingFonts.delete(family);
  })();
  loadingFonts.set(family, promise);
  return promise;
}

export async function loadGoogleFontsIfNeeded(families: string[]): Promise<void> {
  const toLoad = families.filter((f) => isGoogleFont(f) && !loadedFonts.has(f));
  if (toLoad.length === 0) return;
  await Promise.all(toLoad.map(loadGoogleFont));
}
