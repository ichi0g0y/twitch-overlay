import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectSystemFontsAsync, onFontsUpdated, upgradeToLocalFontsIfNeeded } from '../../../utils/fontDetector';
import { GOOGLE_FONTS_LIST, isGoogleFont, loadGoogleFont } from '../../../utils/googleFonts';

type FontPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const PREVIEW_TEXT = 'あいう ABC';

export const FontPicker: React.FC<FontPickerProps> = ({ value, onChange, disabled, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    detectSystemFontsAsync().then((fonts) => {
      if (!cancelled) setSystemFonts(fonts);
    });
    const unsub = onFontsUpdated((fonts) => {
      if (!cancelled) setSystemFonts(fonts);
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const googleEntries = useMemo(
    () => GOOGLE_FONTS_LIST.filter((f) => !filter || f.family.toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );

  const systemEntries = useMemo(
    () => systemFonts.filter((f) => !filter || f.toLowerCase().includes(filter.toLowerCase())),
    [filter, systemFonts],
  );

  const handleSelect = useCallback(
    (family: string) => {
      if (isGoogleFont(family)) void loadGoogleFont(family);
      onChange(family);
      setFilter('');
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filter.trim()) {
          onChange(filter.trim());
          setFilter('');
          setOpen(false);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [filter, onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="flex h-10 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        value={open ? filter : value}
        placeholder={placeholder ?? 'フォントを選択...'}
        disabled={disabled}
        onChange={(e) => {
          setFilter(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setFilter('');
          setOpen(true);
          void upgradeToLocalFontsIfNeeded();
        }}
        onKeyDown={handleKeyDown}
      />

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-gray-700 bg-gray-800 shadow-lg">
          {googleEntries.length > 0 && (
            <div>
              <div className="sticky top-0 bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300">
                Google Fonts
              </div>
              {googleEntries.map((f) => (
                <button
                  key={f.family}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-700 cursor-pointer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(f.family)}
                >
                  <span style={{ fontFamily: `"${f.family}", sans-serif` }}>{f.family}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0" style={{ fontFamily: `"${f.family}", sans-serif` }}>
                    {PREVIEW_TEXT}
                  </span>
                </button>
              ))}
            </div>
          )}
          {systemEntries.length > 0 && (
            <div>
              <div className="sticky top-0 bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300">
                システムフォント
              </div>
              {systemEntries.map((family) => (
                <button
                  key={family}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-700 cursor-pointer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(family)}
                >
                  <span style={{ fontFamily: `"${family}", sans-serif` }}>{family}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0" style={{ fontFamily: `"${family}", sans-serif` }}>
                    {PREVIEW_TEXT}
                  </span>
                </button>
              ))}
            </div>
          )}
          {googleEntries.length === 0 && systemEntries.length === 0 && filter && (
            <div className="px-3 py-2 text-sm text-gray-400">
              一致するフォントなし — Enterで「{filter}」を直接指定
            </div>
          )}
        </div>
      )}
    </div>
  );
};
