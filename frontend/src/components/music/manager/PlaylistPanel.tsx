import type { PlaylistPanelProps } from './types';

const PlaylistPanel = ({ playlists, selectedPlaylist, onSelectPlaylist }: PlaylistPanelProps) => {
  return (
    <div className="lg:col-span-1">
      <h3 className="mb-3 font-medium text-gray-900 dark:text-gray-100">プレイリスト</h3>
      <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
        <div
          onClick={() => onSelectPlaylist(null)}
          className={`cursor-pointer rounded px-3 py-2 transition-colors ${
            selectedPlaylist === null
              ? 'bg-white shadow-sm dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          すべての曲
        </div>

        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            onClick={() => onSelectPlaylist(playlist.id)}
            className={`mt-1 cursor-pointer rounded px-3 py-2 transition-colors ${
              selectedPlaylist === playlist.id
                ? 'bg-white shadow-sm dark:bg-gray-700'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{playlist.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{playlist.track_count}曲</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlaylistPanel;
