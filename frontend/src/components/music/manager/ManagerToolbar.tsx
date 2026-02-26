import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../ui/button';
import type { ManagerToolbarProps } from './types';

const ManagerToolbar = ({
  tracksCount,
  isCreatingPlaylist,
  newPlaylistName,
  onUploadClick,
  onStartCreatePlaylist,
  onCreatePlaylist,
  onCancelCreatePlaylist,
  onDeleteAllClick,
  onNewPlaylistNameChange,
}: ManagerToolbarProps) => {
  return (
    <>
      <div className="mb-6 flex justify-between">
        <div className="flex gap-2">
          <Button onClick={onUploadClick} variant="default" size="sm">
            <Upload className="mr-2 h-4 w-4" />
            音楽をアップロード
          </Button>

          <Button onClick={onStartCreatePlaylist} variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            プレイリストを作成
          </Button>
        </div>

        {tracksCount > 0 && (
          <Button onClick={onDeleteAllClick} variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            すべて削除
          </Button>
        )}
      </div>

      {isCreatingPlaylist && (
        <div className="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="プレイリスト名"
              value={newPlaylistName}
              onChange={(event) => onNewPlaylistNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void onCreatePlaylist();
                }
              }}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <Button onClick={onCreatePlaylist} size="sm" variant="default">
              作成
            </Button>
            <Button onClick={onCancelCreatePlaylist} size="sm" variant="outline">
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default ManagerToolbar;
