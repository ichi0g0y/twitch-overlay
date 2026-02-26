import React, { useEffect } from "react";
import { createPortal } from "react-dom";

type PreviewCloseConfirmDialogProps = {
  isOpen: boolean;
  channelLogin: string;
  channelDisplayName: string;
  onClose: () => void;
  onClosePreviewOnly: () => void;
  onCloseWithComment: () => void;
};

export const PreviewCloseConfirmDialog: React.FC<PreviewCloseConfirmDialogProps> = ({
  isOpen,
  channelLogin,
  channelDisplayName,
  onClose,
  onClosePreviewOnly,
  onCloseWithComment,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-close-title"
      aria-describedby="preview-close-description"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-md border border-gray-700 bg-gray-900 p-4 shadow-2xl">
        <h2 id="preview-close-title" className="text-sm font-semibold text-gray-100">
          プレビューノードを閉じますか？
        </h2>
        <p id="preview-close-description" className="mt-2 text-xs leading-relaxed text-gray-300">
          <span className="font-medium text-gray-100">
            {channelDisplayName}
            {channelDisplayName.toLowerCase() !== channelLogin.toLowerCase() ? ` (${channelLogin})` : ""}
          </span>
          のプレビューを閉じます。
          コメント欄の接続を残すかどうかを選択してください。
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded border border-gray-600 px-3 text-xs text-gray-200 transition hover:bg-gray-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onClosePreviewOnly}
            className="inline-flex h-8 items-center rounded border border-blue-500/70 bg-blue-500/20 px-3 text-xs text-blue-100 transition hover:bg-blue-500/30"
          >
            プレビューのみ閉じる
          </button>
          <button
            type="button"
            onClick={onCloseWithComment}
            className="inline-flex h-8 items-center rounded border border-red-500/70 bg-red-500/20 px-3 text-xs text-red-100 transition hover:bg-red-500/30"
          >
            コメントも閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
