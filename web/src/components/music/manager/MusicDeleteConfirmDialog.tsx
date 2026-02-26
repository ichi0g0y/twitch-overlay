import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';

interface MusicDeleteConfirmDialogProps {
  isOpen: boolean;
  tracksCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export const MusicDeleteConfirmDialog = ({
  isOpen,
  tracksCount,
  onCancel,
  onConfirm,
}: MusicDeleteConfirmDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4'>
        <div className='flex items-center mb-4'>
          <AlertTriangle className='w-6 h-6 text-red-600 mr-3' />
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            すべてのトラックを削除
          </h3>
        </div>
        <p className='text-gray-600 dark:text-gray-400 mb-6'>
          {tracksCount}曲のトラックがすべて削除されます。
          この操作は取り消せません。
        </p>
        <div className='flex justify-end gap-2'>
          <Button onClick={onCancel} variant='outline' size='sm'>
            キャンセル
          </Button>
          <Button onClick={onConfirm} variant='destructive' size='sm'>
            <Trash2 className='w-4 h-4 mr-2' />
            すべて削除
          </Button>
        </div>
      </div>
    </div>
  );
};
