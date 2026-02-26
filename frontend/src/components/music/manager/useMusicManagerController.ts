import { useCallback, useEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@shared/types/music';
import {
  addTrackToPlaylist,
  addTracksToPlaylist,
  createArtworkUrl,
  createPlaylist,
  deleteAllTracks,
  deleteTrack,
  fetchPlaylistTracks,
  fetchPlaylists,
  fetchTracks,
} from './api';
import type { MusicManagerController } from './controllerTypes';
import { useTrackSelection } from './useTrackSelection';

export const useMusicManagerController = (): MusicManagerController => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [dropdownDirection, setDropdownDirection] = useState<Record<string, 'up' | 'down'>>({});
  const [bulkAddingPlaylist, setBulkAddingPlaylist] = useState<string | null>(null);
  const [artworkUrls, setArtworkUrls] = useState<Record<string, string>>({});

  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const displayTracks = selectedPlaylist ? playlistTracks : tracks;
  const {
    selectedTracks,
    setSelectedTracks,
    tracksPerPage,
    setTracksPerPage,
    currentPage,
    setCurrentPage,
    totalPages,
    startIndex,
    endIndex,
    currentTracks,
    handleSelectAll,
    handleSelectTrack,
  } = useTrackSelection(displayTracks);

  const loadTracks = useCallback(async () => {
    try {
      const result = await fetchTracks();
      setTracks(result.tracks);
      setArtworkUrls(result.artworkUrls);
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(await fetchPlaylists());
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  }, []);

  const loadPlaylistTracks = useCallback(async (playlistId: string) => {
    try {
      setPlaylistTracks(await fetchPlaylistTracks(playlistId));
    } catch (error) {
      console.error('Failed to load playlist tracks:', error);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadTracks(), loadPlaylists()]).finally(() => setIsLoading(false));
  }, [loadPlaylists, loadTracks]);

  useEffect(() => {
    if (selectedPlaylist) {
      void loadPlaylistTracks(selectedPlaylist);
      return;
    }
    setPlaylistTracks([]);
  }, [loadPlaylistTracks, selectedPlaylist]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!activeDropdown || !dropdownRefs.current[activeDropdown]) {
        return;
      }

      const rect = dropdownRefs.current[activeDropdown]?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const outside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;

      if (outside) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const calculateDropdownPosition = useCallback((trackId: string) => {
    const button = buttonRefs.current[trackId];
    if (!button) {
      return;
    }

    const spaceBelow = window.innerHeight - button.getBoundingClientRect().bottom;
    setDropdownDirection((prev) => ({ ...prev, [trackId]: spaceBelow < 250 ? 'up' : 'down' }));
  }, []);

  const handleDeleteTrack = useCallback(async (trackId: string) => {
    if (!confirm('このトラックを削除しますか？')) {
      return;
    }

    try {
      await deleteTrack(trackId);
      setTracks((prev) => prev.filter((track) => track.id !== trackId));
      setPlaylistTracks((prev) => prev.filter((track) => track.id !== trackId));
      setSelectedTracks((prev) => prev.filter((id) => id !== trackId));
    } catch (error) {
      console.error('Failed to delete track:', error);
    }
  }, []);

  const handleDeleteAllTracks = useCallback(async () => {
    try {
      await deleteAllTracks();
      setTracks([]);
      setPlaylistTracks([]);
      setArtworkUrls({});
      setSelectedTracks([]);
      setCurrentPage(1);
      setShowDeleteConfirm(false);
      setActiveDropdown(null);
    } catch (error) {
      console.error('Failed to delete all tracks:', error);
    }
  }, []);

  const handleAddToPlaylist = useCallback(
    async (trackId: string, playlistId: string) => {
      setAddingToPlaylist(trackId);
      try {
        await addTrackToPlaylist(trackId, playlistId);
        await loadPlaylists();
        if (selectedPlaylist === playlistId) {
          await loadPlaylistTracks(playlistId);
        }
        setActiveDropdown(null);
      } catch (error) {
        console.error('Failed to add track to playlist:', error);
      } finally {
        setAddingToPlaylist(null);
      }
    },
    [loadPlaylistTracks, loadPlaylists, selectedPlaylist],
  );

  const handleCreatePlaylist = useCallback(async () => {
    if (!newPlaylistName.trim()) {
      return;
    }

    try {
      const playlist = await createPlaylist(newPlaylistName);
      setPlaylists((prev) => [...prev, playlist]);
      setNewPlaylistName('');
      setIsCreatingPlaylist(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  }, [newPlaylistName]);

  const handleUploadComplete = useCallback((track: Track) => {
    setTracks((prev) => [track, ...prev]);
    if (track.has_artwork) {
      setArtworkUrls((prev) => ({ ...prev, [track.id]: createArtworkUrl(track.id) }));
    }
    setCurrentPage(1);
  }, []);

  const handleBulkAddToPlaylist = useCallback(
    async (playlistId: string) => {
      setBulkAddingPlaylist(playlistId);
      try {
        await addTracksToPlaylist(selectedTracks, playlistId);
        await loadPlaylists();
        if (selectedPlaylist === playlistId) {
          await loadPlaylistTracks(playlistId);
        }
        setSelectedTracks([]);
      } catch (error) {
        console.error('Failed to add track:', error);
      } finally {
        setBulkAddingPlaylist(null);
      }
    },
    [loadPlaylistTracks, loadPlaylists, selectedPlaylist, selectedTracks],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`${selectedTracks.length}曲を削除しますか？`)) {
      return;
    }

    for (const trackId of selectedTracks) {
      try {
        await deleteTrack(trackId);
      } catch (error) {
        console.error('Failed to delete track:', error);
      }
    }

    setTracks((prev) => prev.filter((track) => !selectedTracks.includes(track.id)));
    setPlaylistTracks((prev) => prev.filter((track) => !selectedTracks.includes(track.id)));
    setSelectedTracks([]);
  }, [selectedTracks]);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.mp3,.wav,.m4a,.ogg';
    input.onchange = (event: Event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setIsUploadModalOpen(true);
        (window as Window & { tempUploadFiles?: File[] }).tempUploadFiles = files;
      }
    };
    input.click();
  }, []);

  return {
    tracks,
    playlists,
    selectedPlaylist,
    isUploadModalOpen,
    isCreatingPlaylist,
    newPlaylistName,
    isLoading,
    currentPage,
    showDeleteConfirm,
    playlistTracks,
    activeDropdown,
    addingToPlaylist,
    selectedTracks,
    dropdownDirection,
    bulkAddingPlaylist,
    tracksPerPage,
    artworkUrls,
    displayTracks,
    currentTracks,
    totalPages,
    startIndex,
    endIndex,
    dropdownRefs,
    buttonRefs,
    setSelectedPlaylist,
    setIsUploadModalOpen,
    setIsCreatingPlaylist,
    setNewPlaylistName,
    setCurrentPage,
    setShowDeleteConfirm,
    setActiveDropdown,
    setTracksPerPage,
    setSelectedTracks,
    handleDeleteTrack,
    handleDeleteAllTracks,
    handleAddToPlaylist,
    handleCreatePlaylist,
    handleUploadComplete,
    handleSelectAll,
    handleSelectTrack,
    handleBulkAddToPlaylist,
    handleBulkDelete,
    handleUploadClick,
    calculateDropdownPosition,
  };
};
