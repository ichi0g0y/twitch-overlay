import { useEffect, useState } from 'react';

interface Position {
  x: number;
  y: number;
}

const getInitialPosition = (): Position => {
  const saved = localStorage.getItem('debugPanelPosition');
  if (!saved) {
    return { x: 10, y: window.innerHeight / 2 - 50 };
  }

  try {
    return JSON.parse(saved);
  } catch {
    return { x: 10, y: window.innerHeight / 2 - 50 };
  }
};

export const useDebugPanel = () => {
  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem('debugPanelPosition', JSON.stringify(position));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, position]);

  return {
    position,
    isDragging,
    handleMouseDown,
  };
};
