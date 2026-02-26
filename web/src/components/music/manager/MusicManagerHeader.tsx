import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../ui/button';

interface MusicManagerHeaderProps {
  tracksCount: number;
  isCreatingPlaylist: boolean;
  newPlaylistName: string;
  onUploadClick: () => void;
  onStartCreatePlaylist: () => void;
  onDeleteAll: () => void;
  onCreatePlaylist: () => void;
  onCancelCreatePlaylist: () => void;
  onChangePlaylistName: (name: string) => void;
}

export const MusicManagerHeader = ({
  tracksCount,
  isCreatingPlaylist,
  newPlaylistName,
  onUploadClick,
  onStartCreatePlaylist,
  onDeleteAll,
  onCreatePlaylist,
  onCancelCreatePlaylist,
  onChangePlaylistName,
}: MusicManagerHeaderProps) => {
  return (
    <>
      <div className='mb-6 flex justify-between'>
        <div className='flex gap-2'>
          <Button onClick={onUploadClick} variant='default' size='sm'>
            <Upload className='w-4 h-4 mr-2' />
            音楽をアップロード
          </Button>

          <Button onClick={onStartCreatePlaylist} variant='outline' size='sm'>
            <Plus className='w-4 h-4 mr-2' />
            プレイリストを作成
          </Button>
        </div>

        {tracksCount > 0 && (
          <Button onClick={onDeleteAll} variant='destructive' size='sm'>
            <Trash2 className='w-4 h-4 mr-2' />
            すべて削除
          </Button>
        )}
      </div>

      {isCreatingPlaylist && (
        <div className='mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
          <div className='flex gap-2'>
            <input
              type='text'
              placeholder='プレイリスト名'
              value={newPlaylistName}
              onChange={(e) => onChangePlaylistName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onCreatePlaylist()}
              className='flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
            <Button onClick={onCreatePlaylist} size='sm' variant='default'>
              作成
            </Button>
            <Button onClick={onCancelCreatePlaylist} size='sm' variant='outline'>
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
