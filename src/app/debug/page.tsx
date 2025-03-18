'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { getPlacedImages } from '@/lib/imageStorage';

export default function DebugPage() {
  const [supabaseStatus, setSupabaseStatus] = useState<string>('Checking...');
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [confirmedImageCount, setConfirmedImageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawImages, setRawImages] = useState<any[] | null>(null);

  useEffect(() => {
    // Check Supabase connection
    const client = getSupabaseClient();
    if (!client) {
      setSupabaseStatus('Not initialized');
      setError('Supabase client is not initialized');
      return;
    }

    setSupabaseStatus('Initialized');

    // Check image count
    const checkImages = async () => {
      try {
        // Direct Supabase query
        const { data: countData, error: countError } = await client
          .from('images')
          .select('count');
        
        if (countError) {
          setError(`Error counting images: ${countError.message}`);
          return;
        }
        
        setImageCount(countData?.[0]?.count || 0);

        // Check confirmed images
        const { data: confirmedData, error: confirmedError } = await client
          .from('images')
          .select('count')
          .eq('status', 'CONFIRMED');
        
        if (confirmedError) {
          setError(`Error counting confirmed images: ${confirmedError.message}`);
          return;
        }
        
        setConfirmedImageCount(confirmedData?.[0]?.count || 0);

        // Try using the getPlacedImages function
        const { success, data, error: placedError } = await getPlacedImages();
        
        if (!success || placedError) {
          setError(`Error getting placed images: ${placedError?.message || 'Unknown error'}`);
          return;
        }
        
        setRawImages(data || []);
      } catch (err) {
        setError(`Exception: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    checkImages();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase Debug Page</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
        <p><strong>Supabase Client:</strong> {supabaseStatus}</p>
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      )}
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Image Counts</h2>
        <p><strong>Total Images:</strong> {imageCount !== null ? imageCount : 'Loading...'}</p>
        <p><strong>Confirmed Images:</strong> {confirmedImageCount !== null ? confirmedImageCount : 'Loading...'}</p>
      </div>
      
      {rawImages && (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold mb-2">Raw Images Data (First 5)</h2>
          <pre className="bg-black text-green-400 p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(rawImages.slice(0, 5), null, 2)}
          </pre>
          <p className="mt-2"><strong>Total Images Returned:</strong> {rawImages.length}</p>
        </div>
      )}
    </div>
  );
} 