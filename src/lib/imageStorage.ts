// src/lib/imageStorage.ts
import { supabase } from './supabase';

interface ImageRecord {
  image_id: string;
  image_location: string;
  start_position_x: number;
  start_position_y: number;
  size_x: number;
  size_y: number;
  active: boolean;
}

export async function getImageRecords(): Promise<ImageRecord[]> {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching images:', error);
    return [];
  }
  
  return data || [];
}

export async function createImageRecord(record: Omit<ImageRecord, 'image_id' | 'active'>): Promise<ImageRecord | null> {
  const { data, error } = await supabase
    .from('images')
    .insert([record])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating image record:', error);
    return null;
  }
  
  return data;
}