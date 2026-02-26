import { useCallback, useEffect, useState } from 'react';
import type { Track } from '@shared/types/music';

interface UseTrackSelectionResult {
  selectedTracks: string[];
  setSelectedTracks: (value: string[] | ((current: string[]) => string[])) => void;
  tracksPerPage: number;
  setTracksPerPage: (value: number) => void;
  currentPage: number;
  setCurrentPage: (value: number | ((current: number) => number)) => void;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  currentTracks: Track[];
  handleSelectAll: () => void;
  handleSelectTrack: (trackId: string, shiftKey: boolean) => void;
}

export const useTrackSelection = (displayTracks: Track[]): UseTrackSelectionResult => {
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [tracksPerPage, setTracksPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(displayTracks.length / tracksPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * tracksPerPage;
  const endIndex = startIndex + tracksPerPage;
  const currentTracks = displayTracks.slice(startIndex, endIndex);

  useEffect(() => {
    if (safeCurrentPage !== currentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  useEffect(() => {
    setSelectedTracks([]);
  }, [safeCurrentPage, tracksPerPage]);

  const handleSelectAll = useCallback(() => {
    if (selectedTracks.length === currentTracks.length) {
      setSelectedTracks([]);
      return;
    }
    setSelectedTracks(currentTracks.map((track) => track.id));
  }, [currentTracks, selectedTracks.length]);

  const handleSelectTrack = useCallback(
    (trackId: string, shiftKey: boolean) => {
      setSelectedTracks((prev) => {
        if (shiftKey && prev.length > 0) {
          const lastIndex = currentTracks.findIndex((track) => track.id === prev[prev.length - 1]);
          const currentIndex = currentTracks.findIndex((track) => track.id === trackId);
          if (lastIndex < 0 || currentIndex < 0) {
            return prev;
          }

          const rangeIds = currentTracks
            .slice(Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex) + 1)
            .map((track) => track.id);
          return [...new Set([...prev, ...rangeIds])];
        }

        return prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      });
    },
    [currentTracks],
  );

  return {
    selectedTracks,
    setSelectedTracks,
    tracksPerPage,
    setTracksPerPage,
    currentPage: safeCurrentPage,
    setCurrentPage,
    totalPages,
    startIndex,
    endIndex,
    currentTracks,
    handleSelectAll,
    handleSelectTrack,
  };
};
