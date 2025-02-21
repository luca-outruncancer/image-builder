  // src/utils/imageStorage.ts
  import fs from 'fs';
  import path from 'path';
  import { ImageData } from '@/types';
  
  const STORAGE_FILE = path.join(process.cwd(), 'data', 'images.json');
  
  export const saveImageData = async (data: ImageData[]) => {
    await fs.promises.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
  };
  
  export const getImageData = async (): Promise<ImageData[]> => {
    try {
      const data = await fs.promises.readFile(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  };