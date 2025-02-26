// src/store/useImageStore.ts
'use client';

import { create } from 'zustand';

export type ImageToPlace = {
  file: File;
  width: number;
  height: number;
  previewUrl: string;
  cost?: number;
} | null;

type ImageStore = {
  imageToPlace: ImageToPlace;
  setImageToPlace: (image: ImageToPlace) => void;
};

export const useImageStore = create<ImageStore>((set) => ({
  imageToPlace: null,
  setImageToPlace: (image) => set({ imageToPlace: image }),
}));