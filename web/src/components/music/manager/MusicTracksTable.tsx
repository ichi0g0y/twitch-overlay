import type React from 'react';
import { ListPlus, Music as MusicIcon, Trash2 } from 'lucide-react';
import type { Playlist, Track } from '@shared/types/music';
import { buildApiUrl } from '../../../utils/api';
import { Button } from '../../ui/button';

interface MusicTracksTableProps {
  tracksCount: number;
  selectedPlaylist: string | null;
  playlists: Playlist[];
  playlistTracks: Track[];
  displayTracks: Track[];
  currentTracks: Track[];
  selectedTracks: string[];
  activeDropdown: string | null;
  addingToPlaylist: string | null;
  dropdownDirection: Record<string, 'up' | 'down'>;
  dropdownRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  buttonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelectAll: () => void;
  onSelectTrack: (trackId: string, shiftKey: boolean) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleDropdown: (trackId: string, event: React.MouseEvent) => void;
  onAddToPlaylist: (trackId: string, playlistId: string) => void;
}

export const MusicTracksTable = ({
  tracksCount,
  selectedPlaylist,
  playlists,
  playlistTracks,
  displayTracks,
  currentTracks,
  selectedTracks,
  activeDropdown,
  addingToPlaylist,
  dropdownDirection,
  dropdownRefs,
  buttonRefs,
  onSelectAll,
  onSelectTrack,
  onDeleteTrack,
  onToggleDropdown,
  onAddToPlaylist,
}: MusicTracksTableProps) => {
  return (
    <div className='lg:col-span-2'>
      <h3 className='font-medium mb-3 text-gray-900 dark:text-gray-100'>
        {selectedPlaylist
          ? `プレイリスト: ${playlists.find((playlist) => playlist.id === selectedPlaylist)?.name} (${displayTracks.length}曲)`
          : `トラック (${tracksCount}曲)`}
      </h3>
      <div className='bg-gray-50 dark:bg-gray-800 rounded-lg p-4'>
        {displayTracks.length === 0 ? (
          <div className='text-center py-12 text-gray-500 dark:text-gray-400'>
            <MusicIcon className='w-12 h-12 mx-auto mb-3 opacity-50' />
            <p>まだ音楽がアップロードされていません</p>
            <p className='text-sm mt-2'>上のボタンから音楽をアップロードしてください</p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead>
                <tr className='border-b dark:border-gray-700'>
                  <th className='w-10 py-2 align-middle'>
                    <input
                      type='checkbox'
                      className='rounded border-gray-300 dark:border-gray-600'
                      checked={selectedTracks.length > 0 && selectedTracks.length === currentTracks.length}
                      onChange={onSelectAll}
                    />
                  </th>
                  <th className='w-12 py-2' />
                  <th className='text-left py-2 font-medium text-gray-700 dark:text-gray-300'>タイトル</th>
                  <th className='text-left py-2 font-medium text-gray-700 dark:text-gray-300'>アーティスト</th>
                  <th className='text-left py-2 font-medium text-gray-700 dark:text-gray-300 hidden md:table-cell'>
                    アルバム
                  </th>
                  <th className='w-24 py-2' />
                </tr>
              </thead>
              <tbody>
                {currentTracks.map((track) => (
                  <tr key={track.id} className='border-b dark:border-gray-700/50 group'>
                    <td className='py-3'>
                      <input
                        type='checkbox'
                        className='rounded border-gray-300 dark:border-gray-600'
                        checked={selectedTracks.includes(track.id)}
                        onClick={(event) => onSelectTrack(track.id, event.shiftKey)}
                        onChange={() => {}}
                      />
                    </td>
                    <td className='py-3'>
                      <div className='w-8 h-8 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center'>
                        {track.has_artwork ? (
                          <img
                            src={buildApiUrl(`/api/music/track/${track.id}/artwork`)}
                            alt=''
                            className='w-full h-full object-cover'
                            onError={(event) => {
                              const target = event.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.parentElement?.classList.add('no-artwork');
                            }}
                          />
                        ) : null}
                        <MusicIcon className='w-4 h-4 text-gray-400 hidden [.no-artwork_&]:block' />
                      </div>
                    </td>
                    <td className='py-3'>
                      <span className='text-gray-900 dark:text-gray-100'>{track.title}</span>
                    </td>
                    <td className='py-3 text-gray-600 dark:text-gray-400'>{track.artist}</td>
                    <td className='py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell'>{track.album || '-'}</td>
                    <td className='py-3'>
                      <div className='flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                        {playlists.length > 0 && (
                          <div className='relative'>
                            <Button
                              ref={(element) => {
                                if (element) {
                                  buttonRefs.current[track.id] = element;
                                }
                              }}
                              onClick={(event) => onToggleDropdown(track.id, event)}
                              size='sm'
                              variant='ghost'
                              className='text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                              disabled={addingToPlaylist === track.id}
                            >
                              <ListPlus className='w-4 h-4' />
                            </Button>

                            {activeDropdown === track.id && (
                              <div
                                ref={(element) => {
                                  if (element) {
                                    dropdownRefs.current[track.id] = element;
                                  }
                                }}
                                className={`absolute right-0 ${dropdownDirection[track.id] === 'up' ? 'bottom-8' : 'top-8'} z-10 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1`}
                              >
                                <div className='px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700'>
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
                                      className='w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-between items-center'
                                    >
                                      <span>{playlist.name}</span>
                                      {isInPlaylist && <span className='text-xs text-green-600 dark:text-green-400'>✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        <Button
                          onClick={() => onDeleteTrack(track.id)}
                          size='sm'
                          variant='ghost'
                          className='text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20'
                        >
                          <Trash2 className='w-4 h-4' />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
