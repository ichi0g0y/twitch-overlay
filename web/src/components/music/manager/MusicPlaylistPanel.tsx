import type { Playlist } from '@shared/types/music';

interface MusicPlaylistPanelProps {
  playlists: Playlist[];
  selectedPlaylist: string | null;
  onSelectPlaylist: (playlistId: string | null) => void;
}

export const MusicPlaylistPanel = ({
  playlists,
  selectedPlaylist,
  onSelectPlaylist,
}: MusicPlaylistPanelProps) => {
  return (
    <div className='lg:col-span-1'>
      <h3 className='font-medium mb-3 text-gray-900 dark:text-gray-100'>プレイリスト</h3>
      <div className='bg-gray-50 dark:bg-gray-800 rounded-lg p-2'>
        <div
          onClick={() => onSelectPlaylist(null)}
          className={`px-3 py-2 cursor-pointer rounded transition-colors ${
            selectedPlaylist === null
              ? 'bg-white dark:bg-gray-700 shadow-sm'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          すべての曲
        </div>
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            onClick={() => onSelectPlaylist(playlist.id)}
            className={`px-3 py-2 cursor-pointer rounded transition-colors mt-1 ${
              selectedPlaylist === playlist.id
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className='flex justify-between items-center'>
              <span>{playlist.name}</span>
              <span className='text-xs text-gray-500 dark:text-gray-400'>{playlist.track_count}曲</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
