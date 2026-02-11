import React from 'react';

export type OutlinedTextOpts = {
  text: string;
  fontSizePx: number;
  fontWeight: number;
  fontFamily: string;
  fillColor: string;
  strokeColor: string;
  strokeWidthPx: number;
  opacity?: number;
  whiteSpace?: string;
};

export function renderOutlinedText(opts: OutlinedTextOpts): React.ReactElement {
  const effectiveWhiteSpace = opts.whiteSpace || 'pre-wrap';
  const strokeWidth = Math.max(0, opts.strokeWidthPx);

  const base: React.CSSProperties = {
    fontSize: `${opts.fontSizePx}px`,
    fontWeight: opts.fontWeight,
    fontFamily: opts.fontFamily,
    lineHeight: 1,
    whiteSpace: effectiveWhiteSpace as any,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
  };

  if (strokeWidth <= 0) {
    return (
      <span style={{ ...base, color: opts.fillColor, display: 'inline-block', maxWidth: '100%' }}>
        {opts.text}
      </span>
    );
  }

  return (
    <span style={{ ...base, display: 'inline-block', maxWidth: '100%', position: 'relative' }}>
      <span
        style={{
          ...base,
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          WebkitTextStrokeColor: opts.strokeColor,
          WebkitTextStrokeWidth: `${strokeWidth}px`,
        }}
        aria-hidden="true"
      >
        {opts.text}
      </span>
      <span style={{ ...base, position: 'relative', color: opts.fillColor }}>{opts.text}</span>
    </span>
  );
}

export type TranslationSlotStyle = {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textColor: string;
  strokeColor: string;
  strokeWidthPx: number;
};

export type TranslationEntry = {
  slotIndex: number;
  lang: string;
  text: string;
};

export function renderTranslationEntries(
  entries: TranslationEntry[],
  slotStyles: TranslationSlotStyle[],
  spacings: number[],
  lineId: string,
  whiteSpace?: string,
): React.ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <>
      {entries.slice(0, 3).map((t, displayIndex) => {
        const style = slotStyles[t.slotIndex] || slotStyles[0];
        return (
          <div
            key={`${lineId}-${t.lang}`}
            style={displayIndex > 0 ? { marginTop: `${spacings[displayIndex] ?? 0}px` } : undefined}
          >
            {renderOutlinedText({
              text: t.text,
              fontSizePx: style.fontSize,
              fontWeight: style.fontWeight,
              fontFamily: style.fontFamily,
              fillColor: style.textColor,
              strokeColor: style.strokeColor,
              strokeWidthPx: style.strokeWidthPx,
              ...(whiteSpace ? { whiteSpace } : {}),
            })}
          </div>
        );
      })}
    </>
  );
}
