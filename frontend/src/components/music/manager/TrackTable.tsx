import { ListPlus, Music as MusicIcon, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { TrackTableProps } from './types';

const TrackTable = ({
  displayTracks,
  currentTracks,
  selectedTracks,
  playlists,
  selectedPlaylist,
  playlistTracks,
  artworkUrls,
  activeDropdown,
  dropdownDirection,
  addingToPlaylist,
  buttonRefs,
  dropdownRefs,
  onSelectAll,
  onSelectTrack,
  onDeleteTrack,
  onToggleTrackDropdown,
  onAddToPlaylist,
}: TrackTableProps) => {
  if (displayTracks.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          <MusicIcon className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p>まだ音楽がアップロードされていません</p>
          <p className="mt-2 text-sm">上のボタンから音楽をアップロードしてください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="w-10 py-2 align-middle">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 dark:border-gray-600"
                  checked={selectedTracks.length > 0 && selectedTracks.length === currentTracks.length}
                  onChange={onSelectAll}
                />
              </th>
              <th className="w-12 py-2"></th>
              <th className="py-2 text-left font-medium text-gray-700 dark:text-gray-300">タイトル</th>
              <th className="py-2 text-left font-medium text-gray-700 dark:text-gray-300">アーティスト</th>
              <th className="hidden py-2 text-left font-medium text-gray-700 dark:text-gray-300 md:table-cell">アルバム</th>
              <th className="w-24 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {currentTracks.map((track) => (
              <tr key={track.id} className="group border-b dark:border-gray-700/50">
                <td className="py-3">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 dark:border-gray-600"
                    checked={selectedTracks.includes(track.id)}
                    onClick={(event) => onSelectTrack(track.id, event.shiftKey)}
                    onChange={() => {}}
                  />
                </td>
                <td className="py-3">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    {track.has_artwork && artworkUrls[track.id] ? (
                      <img
                        src={artworkUrls[track.id]}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          const target = event.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement?.classList.add('no-artwork');
                        }}
                      />
                    ) : null}
                    <MusicIcon className="hidden h-4 w-4 text-gray-400 [.no-artwork_&]:block" />
                  </div>
                </td>
                <td className="py-3 text-gray-900 dark:text-gray-100">{track.title}</td>
                <td className="py-3 text-gray-600 dark:text-gray-400">{track.artist}</td>
                <td className="hidden py-3 text-gray-600 dark:text-gray-400 md:table-cell">{track.album || '-'}</td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {playlists.length > 0 && (
                      <div className="relative">
                        <Button
                          ref={(element) => {
                            buttonRefs.current[track.id] = element;
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleTrackDropdown(track.id);
                          }}
                          size="sm"
                          variant="ghost"
                          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                          disabled={addingToPlaylist === track.id}
                        >
                          <ListPlus className="h-4 w-4" />
                        </Button>

                        {activeDropdown === track.id && (
                          <div
                            ref={(element) => {
                              dropdownRefs.current[track.id] = element;
                            }}
                            className={`absolute right-0 ${
                              dropdownDirection[track.id] === 'up' ? 'bottom-8' : 'top-8'
                            } z-10 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800`}
                          >
                            <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                              プレイリストに追加
                            </div>
                            {playlists.map((playlist) => {
                              const isInPlaylist =
                                selectedPlaylist === playlist.id &&
                                playlistTracks.some((playlistTrack) => playlistTrack.id === track.id);

                              return (
                                <button
                                  key={playlist.id}
                                  onClick={() => onAddToPlaylist(track.id, playlist.id)}
                                  disabled={isInPlaylist}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700"
                                >
                                  <span>{playlist.name}</span>
                                  {isInPlaylist && <span className="text-xs text-green-600 dark:text-green-400">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        void onDeleteTrack(track.id);
                      }}
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TrackTable;
