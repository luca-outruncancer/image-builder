// src/components/canvas/MagnifierToggle.tsx
// DEPRECATED: This file is no longer used as we've switched to selection-based magnifier
// This file is kept for reference only
'use client';

import { Search } from 'lucide-react';
import { FEATURES } from '@/utils/constants';

interface MagnifierToggleProps {
  isActive: boolean;
  isEnabled: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * DEPRECATED: No longer used with the selection-based magnifier approach
 * Toggle button for the magnifier functionality
 */
const MagnifierToggle: React.FC<MagnifierToggleProps> = ({
  isActive,
  isEnabled,
  onToggle,
  className = '',
}) => {
  // Don't render if the feature is disabled in constants
  if (!FEATURES.IMAGE_MAGNIFIER_ENABLED) return null;

  return (
    <button
      type="button"
      className={`flex items-center justify-center rounded-md p-2 text-sm transition-colors
        ${isActive 
          ? 'bg-blue-500 text-white hover:bg-blue-600' 
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }
        ${className}`}
      onClick={onToggle}
      title={isActive ? 'Disable magnifier (M)' : 'Enable magnifier (M)'}
      aria-label={isActive ? 'Disable magnifier' : 'Enable magnifier'}
      aria-pressed={isActive}
      disabled={!isEnabled}
    >
      <Search size={16} className="mr-2" />
      <span>Magnifier</span>
    </button>
  );
};

export default MagnifierToggle;