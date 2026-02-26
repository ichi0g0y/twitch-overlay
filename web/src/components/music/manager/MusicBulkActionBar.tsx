import { ListPlus, Trash2 } from 'lucide-react';
import type { Playlist } from '@shared/types/music';
import { Button } from '../../ui/button';

interface MusicBulkActionBarProps {
  selectedCount: number;
  playlists: Playlist[];
  activeDropdown: string | null;
  bulkAddingPlaylist: string | null;
  onOpenDropdown: () => void;
  onCloseDropdown: () => void;
  onBulkAddToPlaylist: (playlistId: string) => void;
  onBulkDelete: () => void;
  onCancelSelection: () => void;
}

export const MusicBulkActionBar = ({
  selectedCount,
  playlists,
  activeDropdown,
  bulkAddingPlaylist,
  onOpenDropdown,
  onCloseDropdown,
  onBulkAddToPlaylist,
  onBulkDelete,
  onCancelSelection,
}: MusicBulkActionBarProps) => {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className='fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white p-4 rounded-lg shadow-xl flex items-center gap-4'>
      <span className='text-sm'>{selectedCount}曲選択中</span>

      {playlists.length > 0 && (
        <div className='relative'>
          <Button onClick={onOpenDropdown} size='sm' variant='secondary' disabled={bulkAddingPlaylist !== null}>
            <ListPlus className='w-4 h-4 mr-2' />
            プレイリストに追加
          </Button>

          {activeDropdown === 'bulk' && (
            <div className='absolute bottom-12 left-0 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1'>
              <div className='px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700'>
                プレイリストを選択
              </div>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    onBulkAddToPlaylist(playlist.id);
                    onCloseDropdown();
                  }}
                  disabled={bulkAddingPlaylist === playlist.id}
                  className='w-full px-3 py-2 text-sm text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {playlist.name}
                  {bulkAddingPlaylist === playlist.id && ' (追加中...)'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Button onClick={onBulkDelete} size='sm' variant='destructive'>
        <Trash2 className='w-4 h-4 mr-2' />
        削除
      </Button>

      <Button onClick={onCancelSelection} size='sm' variant='ghost' className='text-gray-300 hover:text-white'>
        キャンセル
      </Button>
    </div>
  );
};
