// src/store/useImageStore.ts
import { create } from 'zustand';

interface ImageToPlace {
  file: File;
  width: number;
  height: number;
  previewUrl: string;
}

interface ImageStore {
  imageToPlace: ImageToPlace | null;
  setImageToPlace: (image: ImageToPlace | null) => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  imageToPlace: null,
  setImageToPlace: (image) => set({ imageToPlace: image }),
}));