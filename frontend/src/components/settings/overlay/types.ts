export type OverlayCardKey = 'musicPlayer' | 'fax' | 'clock' | 'micTranscript' | 'rewardCount' | 'lottery';
export type ColumnKey = 'left' | 'right';
export type CardsLayout = { left: OverlayCardKey[]; right: OverlayCardKey[] };

export const CARD_KEYS: OverlayCardKey[] = [
  'musicPlayer',
  'fax',
  'clock',
  'micTranscript',
  'rewardCount',
  'lottery',
];

export const DEFAULT_CARDS_LAYOUT: CardsLayout = {
  left: ['musicPlayer', 'fax', 'clock', 'micTranscript'],
  right: ['rewardCount', 'lottery'],
};

export const isCardKey = (value: string): value is OverlayCardKey => {
  return CARD_KEYS.includes(value as OverlayCardKey);
};

export const normalizeCardsLayout = (layout?: Partial<CardsLayout> | null): CardsLayout => {
  const leftCandidate = layout?.left;
  const rightCandidate = layout?.right;
  const rawLeft = Array.isArray(leftCandidate) ? leftCandidate : [];
  const rawRight = Array.isArray(rightCandidate) ? rightCandidate : [];
  const used = new Set<OverlayCardKey>();

  const pick = (items: unknown[]) => {
    const result: OverlayCardKey[] = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (!isCardKey(item)) continue;
      if (used.has(item)) continue;
      used.add(item);
      result.push(item);
    }
    return result;
  };

  const left = pick(rawLeft);
  const right = pick(rawRight);

  for (const key of CARD_KEYS) {
    if (!used.has(key)) {
      left.push(key);
    }
  }

  return { left, right };
};

export const parseCardsLayout = (value?: string): CardsLayout => {
  if (!value) return DEFAULT_CARDS_LAYOUT;

  try {
    return normalizeCardsLayout(JSON.parse(value));
  } catch (error) {
    console.error('[OverlaySettings] Failed to parse card layout:', error);
    return DEFAULT_CARDS_LAYOUT;
  }
};
