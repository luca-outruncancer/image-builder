// src/utils/constants.ts
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1000;
export const GRID_SIZE = 10;
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export const PRESET_SIZES = [
  { width: 100, height: 50 },
  { width: 100, height: 100 },
  { width: 200, height: 200 },
  { width: 400, height: 200 }
] as const;