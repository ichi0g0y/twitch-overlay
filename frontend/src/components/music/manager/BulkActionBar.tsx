import { ListPlus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { BulkActionBarProps } from './types';

const BulkActionBar = ({
  selectedTracksCount,
  playlists,
  activeDropdown,
  bulkAddingPlaylist,
  onOpenBulkDropdown,
  onBulkAddToPlaylist,
  onBulkDelete,
  onClearSelection,
  onCloseBulkDropdown,
}: BulkActionBarProps) => {
  if (selectedTracksCount <= 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-4 rounded-lg bg-gray-900 p-4 text-white shadow-xl">
      <span className="text-sm">{selectedTracksCount}曲選択中</span>

      {playlists.length > 0 && (
        <div className="relative">
          <Button onClick={onOpenBulkDropdown} size="sm" variant="secondary" disabled={bulkAddingPlaylist !== null}>
            <ListPlus className="mr-2 h-4 w-4" />
            プレイリストに追加
          </Button>

          {activeDropdown === 'bulk' && (
            <div className="absolute bottom-12 left-0 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                プレイリストを選択
              </div>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    void onBulkAddToPlaylist(playlist.id);
                    onCloseBulkDropdown();
                  }}
                  disabled={bulkAddingPlaylist === playlist.id}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  {playlist.name}
                  {bulkAddingPlaylist === playlist.id && ' (追加中...)'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        onClick={() => {
          void onBulkDelete();
        }}
        size="sm"
        variant="destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        削除
      </Button>

      <Button onClick={onClearSelection} size="sm" variant="ghost" className="text-gray-300 hover:text-white">
        キャンセル
      </Button>
    </div>
  );
};

export default BulkActionBar;
