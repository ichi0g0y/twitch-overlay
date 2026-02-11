const GOOGLE_FONT_FAMILIES = new Set([
  'Noto Sans JP', 'Noto Serif JP',
  'M PLUS 1p', 'M PLUS Rounded 1c', 'M PLUS 1', 'M PLUS 2',
  'Kosugi', 'Kosugi Maru',
  'Sawarabi Gothic', 'Sawarabi Mincho',
  'Zen Kaku Gothic New', 'Zen Maru Gothic', 'Zen Antique', 'Zen Old Mincho', 'Zen Kurenaido',
  'BIZ UDPGothic', 'BIZ UDPMincho',
  'Shippori Mincho',
  'Hachi Maru Pop', 'Yusei Magic', 'Reggae One', 'RocknRoll One', 'Train One',
  'DotGothic16', 'Potta One', 'Rampart One', 'Stick', 'Dela Gothic One',
  'Klee One', 'Yomogi', 'Kaisei Decol',
]);

const loadedFonts = new Set<string>();

function buildGoogleFontsUrl(families: string[]): string {
  const params = families.map((f) => `family=${encodeURIComponent(f)}:wght@100..900`).join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

export function isGoogleFont(family: string): boolean {
  return GOOGLE_FONT_FAMILIES.has(family);
}

export function ensureGoogleFontsLoaded(families: string[]): void {
  const toLoad = families.filter((f) => isGoogleFont(f) && !loadedFonts.has(f));
  if (toLoad.length === 0) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = buildGoogleFontsUrl(toLoad);
  document.head.appendChild(link);
  for (const f of toLoad) loadedFonts.add(f);
}
