export interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string; // Using string to match database payment_status enum
  file?: File;
  cost?: number;
}

export interface CanvasImageLoaderProps {
  placedImages: PlacedImage[];
}

export interface CanvasImagePlacementProps {
  tempImage: PlacedImage;
} 