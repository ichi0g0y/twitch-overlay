import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import type { PaginationControlsProps } from './types';

const PaginationControls = ({
  tracksPerPage,
  displayTracksLength,
  startIndex,
  endIndex,
  currentPage,
  totalPages,
  onTracksPerPageChange,
  onGoToFirstPage,
  onGoToPrevPage,
  onGoToNextPage,
  onGoToLastPage,
}: PaginationControlsProps) => {
  if (displayTracksLength === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">表示:</span>
        <select
          value={tracksPerPage}
          onChange={(event) => onTracksPerPageChange(Number(event.target.value))}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
        >
          <option value="10">10曲</option>
          <option value="20">20曲</option>
          <option value="50">50曲</option>
          <option value="100">100曲</option>
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          (全{displayTracksLength}曲中 {startIndex + 1}-{Math.min(endIndex, displayTracksLength)}曲を表示)
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button onClick={onGoToFirstPage} disabled={currentPage === 1} size="sm" variant="outline" className="hidden sm:inline-flex">
            最初
          </Button>
          <Button onClick={onGoToPrevPage} disabled={currentPage === 1} size="sm" variant="outline">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3">
            <span className="text-sm font-medium">{currentPage}</span>
            <span className="text-sm text-gray-500">/</span>
            <span className="text-sm">{totalPages}</span>
          </div>
          <Button onClick={onGoToNextPage} disabled={currentPage === totalPages} size="sm" variant="outline">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={onGoToLastPage}
            disabled={currentPage === totalPages}
            size="sm"
            variant="outline"
            className="hidden sm:inline-flex"
          >
            最後
          </Button>
        </div>
      )}
    </div>
  );
};

export default PaginationControls;
