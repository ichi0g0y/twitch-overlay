import React from 'react';
import { Check, Copy, X } from 'lucide-react';

export const RawDataModal: React.FC<{
  open: boolean;
  rawDataJson: string;
  rawDataCopied: boolean;
  onCopy: () => void;
  onClose: () => void;
}> = ({ open, rawDataJson, rawDataCopied, onCopy, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[min(80vh,680px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">コメント生データ</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="コメント生データをコピー"
              title="コメント生データをコピー"
            >
              {rawDataCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{rawDataCopied ? 'コピー済み' : 'コピー'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="コメント生データモーダルを閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-4 dark:bg-gray-950">
          <pre className="min-h-full whitespace-pre-wrap break-all rounded border border-gray-200 bg-white p-3 font-mono text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            {rawDataJson}
          </pre>
        </div>
      </div>
    </div>
  );
};
