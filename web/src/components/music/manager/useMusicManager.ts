import { useEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@shared/types/music';
import { addTrackToPlaylist, createPlaylist, deleteAllTracks, deleteTrackById, fetchPlaylists, fetchPlaylistTracks, fetchTracks } from './musicManagerApi';

export const useMusicManager = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [dropdownDirection, setDropdownDirection] = useState<Record<string, 'up' | 'down'>>({});
  const [bulkAddingPlaylist, setBulkAddingPlaylist] = useState<string | null>(null);
  const [tracksPerPage, setTracksPerPage] = useState(20);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadTracks = async () => {
    try {
      setTracks(await fetchTracks());
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
  };

  const loadPlaylists = async () => {
    try {
      setPlaylists(await fetchPlaylists());
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  };

  const loadPlaylistTracks = async (playlistId: string) => {
    try {
      setPlaylistTracks(await fetchPlaylistTracks(playlistId));
    } catch (error) {
      console.error('Failed to load playlist tracks:', error);
    }
  };

  useEffect(() => {
    Promise.all([loadTracks(), loadPlaylists()]).then(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistTracks(selectedPlaylist);
    } else {
      setPlaylistTracks([]);
    }
  }, [selectedPlaylist]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!activeDropdown || !dropdownRefs.current[activeDropdown]) return;
      const rect = dropdownRefs.current[activeDropdown]?.getBoundingClientRect();
      if (!rect) return;
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const displayTracks = selectedPlaylist ? playlistTracks : tracks;
  const totalPages = Math.ceil(displayTracks.length / tracksPerPage);
  const startIndex = (currentPage - 1) * tracksPerPage;
  const endIndex = startIndex + tracksPerPage;
  const currentTracks = displayTracks.slice(startIndex, endIndex);

  useEffect(() => {
    setSelectedTracks([]);
  }, [currentPage, tracksPerPage]);

  const calculateDropdownPosition = (trackId: string) => {
    const button = buttonRefs.current[trackId];
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownDirection((prev) => ({ ...prev, [trackId]: spaceBelow < 250 ? 'up' : 'down' }));
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm('このトラックを削除しますか？')) return;
    try {
      const response = await deleteTrackById(trackId);
      if (response.ok) setTracks((prev) => prev.filter((track) => track.id !== trackId));
    } catch (error) {
      console.error('Failed to delete track:', error);
    }
  };

  const handleDeleteAllTracks = async () => {
    try {
      const response = await deleteAllTracks();
      if (response.ok) {
        setTracks([]);
        setCurrentPage(1);
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Failed to delete all tracks:', error);
    }
  };

  const handleAddToPlaylist = async (trackId: string, playlistId: string) => {
    setAddingToPlaylist(trackId);
    try {
      const response = await addTrackToPlaylist(trackId, playlistId);
      if (response.ok) {
        await loadPlaylists();
        if (selectedPlaylist === playlistId) await loadPlaylistTracks(playlistId);
        setActiveDropdown(null);
      }
    } catch (error) {
      console.error('Failed to add track to playlist:', error);
    } finally {
      setAddingToPlaylist(null);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const playlist = await createPlaylist(newPlaylistName);
      if (playlist) {
        setPlaylists((prev) => [...prev, playlist]);
        setNewPlaylistName('');
        setIsCreatingPlaylist(false);
      }
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const handleUploadComplete = (track: Track) => {
    setTracks((prev) => [track, ...prev]);
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (selectedTracks.length === currentTracks.length) {
      setSelectedTracks([]);
    } else {
      setSelectedTracks(currentTracks.map((track) => track.id));
    }
  };

  const handleSelectTrack = (trackId: string, shiftKey: boolean) => {
    setSelectedTracks((prev) => {
      if (shiftKey && prev.length > 0) {
        const lastSelected = prev[prev.length - 1];
        const lastIndex = currentTracks.findIndex((track) => track.id === lastSelected);
        const currentIndex = currentTracks.findIndex((track) => track.id === trackId);
        const rangeIds = currentTracks.slice(Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex) + 1).map((track) => track.id);
        return [...new Set([...prev, ...rangeIds])];
      }
      return prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId];
    });
  };

  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.mp3,.wav,.m4a,.ogg';
    input.onchange = (event: Event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setIsUploadModalOpen(true);
        (window as any).tempUploadFiles = files;
      }
    };
    input.click();
  };

  const handleBulkAddToPlaylist = async (playlistId: string) => {
    setBulkAddingPlaylist(playlistId);
    for (const trackId of selectedTracks) {
      try {
        await addTrackToPlaylist(trackId, playlistId);
      } catch (error) {
        console.error('Failed to add track:', error);
      }
    }
    await loadPlaylists();
    if (selectedPlaylist === playlistId) await loadPlaylistTracks(playlistId);
    setSelectedTracks([]);
    setBulkAddingPlaylist(null);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`${selectedTracks.length}曲を削除しますか？`)) return;
    for (const trackId of selectedTracks) {
      try {
        await deleteTrackById(trackId);
      } catch (error) {
        console.error('Failed to delete track:', error);
      }
    }
    setTracks((prev) => prev.filter((track) => !selectedTracks.includes(track.id)));
    setSelectedTracks([]);
  };

  return {
    tracks, playlists, selectedPlaylist, setSelectedPlaylist, isUploadModalOpen, setIsUploadModalOpen,
    isCreatingPlaylist, setIsCreatingPlaylist, newPlaylistName, setNewPlaylistName, isLoading, currentPage,
    setCurrentPage, showDeleteConfirm, setShowDeleteConfirm, playlistTracks, activeDropdown, setActiveDropdown,
    addingToPlaylist, selectedTracks, setSelectedTracks, dropdownDirection, bulkAddingPlaylist, setBulkAddingPlaylist,
    tracksPerPage, setTracksPerPage, dropdownRefs, buttonRefs, calculateDropdownPosition, displayTracks,
    totalPages, startIndex, endIndex, currentTracks, handleDeleteTrack, handleDeleteAllTracks,
    handleAddToPlaylist, handleCreatePlaylist, handleUploadComplete, handleSelectAll, handleSelectTrack,
    handleUploadClick, handleBulkAddToPlaylist, handleBulkDelete,
  };
};
