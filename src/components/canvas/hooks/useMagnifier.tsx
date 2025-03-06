// src/components/canvas/hooks/useMagnifier.tsx
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FEATURES, MAGNIFIER } from '@/utils/constants';

export interface MagnifierState {
  active: boolean;
  zoomFactor: number;
  size: number;
  borderWidth: number;
  borderColor: string;
}

/**
 * Custom hook to manage magnifier state
 * @returns Magnifier state and control functions
 */
export function useMagnifier() {
  // State to track if magnifier is enabled
  const [isEnabled, setIsEnabled] = useState<boolean>(FEATURES.IMAGE_MAGNIFIER_ENABLED);
  
  // State to track if magnifier is active (toggled on)
  const [isActive, setIsActive] = useState<boolean>(false);
  
  // Magnifier configuration settings
  const [config, setConfig] = useState<Omit<MagnifierState, 'active'>>({
    zoomFactor: MAGNIFIER.ZOOM_FACTOR,
    size: MAGNIFIER.SIZE,
    borderWidth: MAGNIFIER.BORDER_WIDTH,
    borderColor: MAGNIFIER.BORDER_COLOR
  });
  
  // Check if local storage is available
  const isLocalStorageAvailable = () => {
    try {
      const test = 'test';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  };
  
  // Keyboard shortcut handler to toggle magnifier with 'M' key
  useEffect(() => {
    if (!isEnabled) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsActive(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEnabled]);
  
  // Load saved preferences from localStorage if available
  useEffect(() => {
    if (!isLocalStorageAvailable()) return;
    
    try {
      const savedConfig = localStorage.getItem('magnifierConfig');
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
      
      const savedStatus = localStorage.getItem('magnifierEnabled');
      if (savedStatus !== null) {
        setIsEnabled(savedStatus === 'true');
      }
    } catch (error) {
      console.error('Error loading magnifier preferences:', error);
    }
  }, []);
  
  // Save preferences to localStorage when they change
  useEffect(() => {
    if (!isLocalStorageAvailable()) return;
    
    try {
      localStorage.setItem('magnifierConfig', JSON.stringify(config));
      localStorage.setItem('magnifierEnabled', String(isEnabled));
    } catch (error) {
      console.error('Error saving magnifier preferences:', error);
    }
  }, [config, isEnabled]);
  
  // Toggle magnifier on/off
  const toggleMagnifier = useCallback(() => {
    setIsActive(prev => !prev);
  }, []);
  
  // Toggle magnifier enabled/disabled globally
  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
    if (isEnabled) {
      setIsActive(false);
    }
  }, [isEnabled]);
  
  // Update magnifier configuration
  const updateConfig = useCallback((newConfig: Partial<Omit<MagnifierState, 'active'>>) => {
    setConfig(prev => ({
      ...prev,
      ...newConfig
    }));
  }, []);
  
  // Combined state object
  const magnifierState: MagnifierState = {
    active: isEnabled && isActive,
    ...config
  };
  
  return {
    magnifierState,
    isEnabled,
    isActive,
    toggleMagnifier,
    toggleEnabled,
    updateConfig
  };
}

export default useMagnifier;