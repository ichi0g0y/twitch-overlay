import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { DeleteConfirmModalProps } from './types';

const DeleteConfirmModal = ({ isOpen, tracksCount, onCancel, onConfirm }: DeleteConfirmModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
        <div className="mb-4 flex items-center">
          <AlertTriangle className="mr-3 h-6 w-6 text-red-600" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">すべてのトラックを削除</h3>
        </div>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          {tracksCount}曲のトラックがすべて削除されます。
          この操作は取り消せません。
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="outline" size="sm">
            キャンセル
          </Button>
          <Button
            onClick={() => {
              void onConfirm();
            }}
            variant="destructive"
            size="sm"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            すべて削除
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
