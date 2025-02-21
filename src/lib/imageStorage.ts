// src/lib/imageStorage.ts
export interface ImageRecord {
  image_id: number;
  image_location: string;
  size_x: number;
  size_y: number;
  start_position_x: number;
  start_position_y: number;
  active: boolean;
  timestamp: string;
}

export const saveImageRecord = async (record: Omit<ImageRecord, 'image_id'>) => {
  try {
    const response = await fetch('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) throw new Error('Failed to save record');
    const data = await response.json();
    return data.record;
  } catch (error) {
    console.error('Failed to save image record:', error);
    throw error;
  }
};

export const getImageRecords = async (): Promise<ImageRecord[]> => {
  try {
    const response = await fetch('/api/images');
    if (!response.ok) throw new Error('Failed to fetch records');
    const data = await response.json();
    return data.images;
  } catch (error) {
    console.error('Failed to read image records:', error);
    return [];
  }
};