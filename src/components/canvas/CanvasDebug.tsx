'use client';

import { useState, useEffect } from 'react';
import { FEATURES } from '@/utils/constants';

interface CacheStats {
  isInitialized: boolean;
  imageCount: number;
  spatialIndexSize: number;
  lastRefreshTime: number;
  ageSeconds: number;
}

export default function CanvasDebug() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchCacheStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/cache-status');
      if (!response.ok) {
        throw new Error(`Failed to fetch cache status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.stats) {
        setCacheStats(data.stats);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };
  
  const refreshCache = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/cache-status', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to refresh cache: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.stats) {
        setCacheStats(data.stats);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    // Only fetch if debug mode is enabled
    if (FEATURES.DEBUG_MODE) {
      fetchCacheStats();
      
      // Refresh every 30 seconds
      const interval = setInterval(fetchCacheStats, 30000);
      return () => clearInterval(interval);
    }
  }, []);
  
  if (!FEATURES.DEBUG_MODE) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs z-50 max-w-xs">
      <h3 className="font-bold mb-1">Image Cache Status</h3>
      
      {error && (
        <div className="text-red-400 mb-2">Error: {error}</div>
      )}
      
      {isLoading && !cacheStats ? (
        <div>Loading cache stats...</div>
      ) : cacheStats ? (
        <div>
          <div className="grid grid-cols-2 gap-x-2">
            <span>Status:</span>
            <span className={cacheStats.isInitialized ? 'text-green-400' : 'text-red-400'}>
              {cacheStats.isInitialized ? 'Initialized' : 'Not Initialized'}
            </span>
            
            <span>Images:</span>
            <span>{cacheStats.imageCount}</span>
            
            <span>Index Size:</span>
            <span>{cacheStats.spatialIndexSize.toLocaleString()}</span>
            
            <span>Age:</span>
            <span>{cacheStats.ageSeconds}s</span>
          </div>
          
          <button
            onClick={refreshCache}
            disabled={isLoading}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs w-full disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Cache'}
          </button>
        </div>
      ) : (
        <div>No cache stats available</div>
      )}
    </div>
  );
} 