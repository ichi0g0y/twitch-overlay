import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

import {
  extractFragments,
  fragmentsToIrcText,
  insertEmoteAtCursor,
  insertTextAtCursor,
  isContentEmpty,
  moveCursorToEnd,
  type InputFragment,
} from './chatInputUtils';

export type RichChatInputRef = {
  insertEmote: (name: string, url: string) => void;
  getFragments: () => InputFragment[];
  getIrcText: () => string;
  isEmpty: () => boolean;
  clear: () => void;
  focus: () => void;
};

type RichChatInputProps = {
  placeholder: string;
  disabled?: boolean;
  onSubmit: () => void;
  onChangeHasContent?: (hasContent: boolean) => void;
  onChangeText?: () => void;
  rightAccessory?: React.ReactNode;
};

export const RichChatInput = forwardRef<RichChatInputRef, RichChatInputProps>(({
  placeholder,
  disabled = false,
  onSubmit,
  onChangeHasContent,
  onChangeText,
  rightAccessory,
}, ref) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [hasContent, setHasContent] = useState(false);

  const syncContentState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHasContent = !isContentEmpty(editor);
    setHasContent(nextHasContent);
    onChangeHasContent?.(nextHasContent);
  }, [onChangeHasContent]);

  const saveSelectionRange = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
  }, []);

  const restoreSelectionRange = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !savedRangeRef.current) return;
    if (selection.rangeCount > 0) {
      const current = selection.getRangeAt(0);
      if (editor.contains(current.commonAncestorContainer)) return;
    }
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current.cloneRange());
  }, []);

  useImperativeHandle(ref, () => ({
    insertEmote: (name: string, url: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelectionRange();
      insertEmoteAtCursor(editor, name, url);
      saveSelectionRange();
      syncContentState();
      onChangeText?.();
    },
    getFragments: () => {
      const editor = editorRef.current;
      if (!editor) return [];
      return extractFragments(editor);
    },
    getIrcText: () => {
      const editor = editorRef.current;
      if (!editor) return '';
      return fragmentsToIrcText(extractFragments(editor));
    },
    isEmpty: () => {
      const editor = editorRef.current;
      if (!editor) return true;
      return isContentEmpty(editor);
    },
    clear: () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.innerHTML = '';
      savedRangeRef.current = null;
      syncContentState();
    },
    focus: () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      if (savedRangeRef.current) {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(savedRangeRef.current.cloneRange());
          return;
        }
      }
      moveCursorToEnd(editor);
    },
  }), [onChangeText, restoreSelectionRange, saveSelectionRange, syncContentState]);

  return (
    <div className="relative flex-1">
      {!hasContent && (
        <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 ${rightAccessory ? 'pr-12' : ''}`}>
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="false"
        aria-label="コメント入力"
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={() => {
          saveSelectionRange();
          syncContentState();
          onChangeText?.();
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          saveSelectionRange();
          syncContentState();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          const editor = editorRef.current;
          if (!editor || text === '') return;
          insertTextAtCursor(editor, text);
          saveSelectionRange();
          syncContentState();
          onChangeText?.();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          if (isComposingRef.current || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onSubmit();
        }}
        onKeyUp={saveSelectionRange}
        onMouseUp={saveSelectionRange}
        className={`min-h-9 max-h-24 overflow-y-auto rounded-md border border-gray-200 bg-white px-3 py-[7px] text-sm text-gray-900 outline-none ring-offset-white transition focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:ring-offset-gray-900 dark:focus-visible:ring-blue-600 ${
          rightAccessory ? 'pr-12' : ''
        } ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
      />
      {rightAccessory && (
        <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
          {rightAccessory}
        </div>
      )}
    </div>
  );
});

RichChatInput.displayName = 'RichChatInput';
