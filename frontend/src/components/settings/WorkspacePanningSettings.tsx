import React, { useEffect, useRef, useState } from 'react';
import { Panel } from '@xyflow/react';

interface WorkspacePanningSettingsProps {
  panActivationKeyCode: string;
  onPanActivationKeyCodeChange: (value: string) => void;
  zoomActivationKeyCode: string;
  onZoomActivationKeyCodeChange: (value: string) => void;
  onClose: () => void;
}

type CaptureTarget = 'zoom' | 'pan' | null;

const formatKeyDisplay = (code: string): string => {
  if (!code) return '-';
  if (code === 'Space') return 'Space';
  if (code === 'Control') return 'Ctrl';
  if (code === 'Meta') return 'Cmd';
  if (code === 'Alt') return 'Alt';
  if (code === 'Shift') return 'Shift';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad') && code.length > 6) return `Num ${code.slice(6)}`;
  if (code.endsWith('Left')) return code.replace(/Left$/, '');
  if (code.endsWith('Right')) return code.replace(/Right$/, '');
  if (code === 'Escape') return 'Esc';
  if (code.startsWith('Arrow')) return code.replace('Arrow', '');
  return code;
};

const normalizeZoomActivationCapturedCode = (code: string): string => {
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Control';
  if (code === 'MetaLeft' || code === 'MetaRight') return 'Meta';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  return code;
};

export const WorkspacePanningSettings: React.FC<WorkspacePanningSettingsProps> = ({
  panActivationKeyCode,
  onPanActivationKeyCodeChange,
  zoomActivationKeyCode,
  onZoomActivationKeyCodeChange,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setCaptureTarget(null);
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!panelRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (panelRef.current.contains(event.target)) return;
      setCaptureTarget(null);
      onClose();
    };

    const handleWindowBlur = () => {
      setCaptureTarget(null);
      onClose();
    };

    document.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (captureTarget) {
          setCaptureTarget(null);
          return;
        }
        onClose();
        return;
      }

      if (!captureTarget) return;
      if (!event.code) return;

      event.preventDefault();
      event.stopPropagation();
      if (captureTarget === 'pan') {
        onPanActivationKeyCodeChange(event.code);
      } else {
        onZoomActivationKeyCodeChange(normalizeZoomActivationCapturedCode(event.code));
      }
      setCaptureTarget(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [captureTarget, onClose, onPanActivationKeyCodeChange, onZoomActivationKeyCodeChange]);

  return (
    <Panel position="bottom-left" className="pointer-events-none !m-3">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="pointer-events-auto w-72 rounded-md border border-gray-700 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">ワークスペース設定</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
            aria-label="設定パネルを閉じる"
          >
            ×
          </button>
        </div>

        <div className="border-t border-gray-700 pt-3">
          <p className="mb-2 text-[11px] text-gray-400">ズーム起動キー</p>
          <button
            type="button"
            onClick={() => setCaptureTarget('zoom')}
            className={`inline-flex h-8 min-w-24 items-center justify-center rounded border px-3 font-mono text-xs ${
              captureTarget === 'zoom'
                ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                : 'border-gray-700 bg-gray-950/60 text-gray-200 hover:bg-gray-800'
            }`}
            aria-label="ズーム起動キーを設定"
          >
            {captureTarget === 'zoom' ? '入力待機中...' : formatKeyDisplay(zoomActivationKeyCode)}
          </button>
          <p className="mt-2 text-[11px] text-gray-500">押しながらホイールでどこでもズーム</p>
        </div>

        <div className="mt-3 border-t border-gray-700 pt-3">
          <p className="mb-2 text-[11px] text-gray-400">パン起動キー</p>
          <button
            type="button"
            onClick={() => setCaptureTarget('pan')}
            className={`inline-flex h-8 min-w-24 items-center justify-center rounded border px-3 font-mono text-xs ${
              captureTarget === 'pan'
                ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                : 'border-gray-700 bg-gray-950/60 text-gray-200 hover:bg-gray-800'
            }`}
            aria-label="パン起動キーを設定"
          >
            {captureTarget === 'pan' ? '入力待機中...' : formatKeyDisplay(panActivationKeyCode)}
          </button>
          <p className="mt-2 text-[11px] text-gray-500">クリック後にキーを押して設定</p>
        </div>
      </div>
    </Panel>
  );
};
