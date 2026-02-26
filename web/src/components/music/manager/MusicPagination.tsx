import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';

interface MusicPaginationProps {
  displayTracksCount: number;
  tracksPerPage: number;
  startIndex: number;
  endIndex: number;
  currentPage: number;
  totalPages: number;
  onChangeTracksPerPage: (value: number) => void;
  onGoFirst: () => void;
  onGoPrevious: () => void;
  onGoNext: () => void;
  onGoLast: () => void;
}

export const MusicPagination = ({
  displayTracksCount,
  tracksPerPage,
  startIndex,
  endIndex,
  currentPage,
  totalPages,
  onChangeTracksPerPage,
  onGoFirst,
  onGoPrevious,
  onGoNext,
  onGoLast,
}: MusicPaginationProps) => {
  if (displayTracksCount === 0) {
    return null;
  }

  return (
    <div className='mt-4 flex flex-col sm:flex-row justify-between items-center gap-4'>
      <div className='flex items-center gap-2'>
        <span className='text-sm text-gray-600 dark:text-gray-400'>表示:</span>
        <select
          value={tracksPerPage}
          onChange={(event) => onChangeTracksPerPage(Number(event.target.value))}
          className='px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
        >
          <option value='10'>10曲</option>
          <option value='20'>20曲</option>
          <option value='50'>50曲</option>
          <option value='100'>100曲</option>
        </select>
        <span className='text-sm text-gray-500 dark:text-gray-400'>
          (全{displayTracksCount}曲中 {startIndex + 1}-{Math.min(endIndex, displayTracksCount)}曲を表示)
        </span>
      </div>

      {totalPages > 1 && (
        <div className='flex items-center gap-1'>
          <Button
            onClick={onGoFirst}
            disabled={currentPage === 1}
            size='sm'
            variant='outline'
            className='hidden sm:inline-flex'
          >
            最初
          </Button>
          <Button onClick={onGoPrevious} disabled={currentPage === 1} size='sm' variant='outline'>
            <ChevronLeft className='w-4 h-4' />
          </Button>
          <div className='flex items-center gap-2 px-3'>
            <span className='text-sm font-medium'>{currentPage}</span>
            <span className='text-sm text-gray-500'>/</span>
            <span className='text-sm'>{totalPages}</span>
          </div>
          <Button onClick={onGoNext} disabled={currentPage === totalPages} size='sm' variant='outline'>
            <ChevronRight className='w-4 h-4' />
          </Button>
          <Button
            onClick={onGoLast}
            disabled={currentPage === totalPages}
            size='sm'
            variant='outline'
            className='hidden sm:inline-flex'
          >
            最後
          </Button>
        </div>
      )}
    </div>
  );
};
