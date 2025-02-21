// src/components/canvas/GridOverlay.tsx
'use client';

import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';

const GridOverlay = () => {
  const columns = CANVAS_WIDTH / GRID_SIZE;
  const rows = CANVAS_HEIGHT / GRID_SIZE;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute top-0 left-0">
        {Array.from({ length: columns + 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * GRID_SIZE}
            y1={0}
            x2={i * GRID_SIZE}
            y2={CANVAS_HEIGHT}
            stroke="#ddd"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * GRID_SIZE}
            x2={CANVAS_WIDTH}
            y2={i * GRID_SIZE}
            stroke="#ddd"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
};

export default GridOverlay;