// src/utils/constants.ts
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1000;
export const GRID_SIZE = 10;
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export const PRESET_SIZES = [
  { width: 10, height: 10 },
  { width: 20, height: 20 },
  { width: 50, height: 50 },
  { width: 100, height: 10 },
  { width: 100, height: 100 },
  { width: 200, height: 100 }
] as const;