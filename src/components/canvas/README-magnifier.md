# Canvas Magnifier Implementation

This directory contains a hover-based magnifier implementation for the canvas component.

## Overview

The magnifier shows a 10x enlarged view of the grid cell where the cursor is hovering. It appears after a brief delay (500ms) when the mouse remains over a cell, and disappears when the mouse moves.

## Features

- **Hover-based activation**: Appears after cursor stays on a cell for 500ms
- **10x magnification**: Enlarges a 10x10 grid cell to 100x100 pixels
- **Auto-positioning**: Smartly positions to stay within canvas boundaries
- **Cell highlighting**: Shows which cell is being magnified
- **Wallet address display**: Shows the wallet address of the cell owner (toggleable)

## Configuration

The magnifier can be configured in `src/utils/constants.ts`:

```typescript
// Feature flags
export const FEATURES = {
  IMAGE_MAGNIFIER_ENABLED: true,     // Toggle magnifier functionality
  SHOW_OWNER_WALLET: true,           // Show owner wallet address in magnifier
};

// Magnifier settings
export const MAGNIFIER = {
  ZOOM_FACTOR: 10.0,      // 10x magnification for the hover magnifier
  HOVER_DELAY_MS: 500,    // Delay before showing magnifier on hover
  BORDER_COLOR: '#3B82F6', // Border color (blue)
  BORDER_WIDTH: 2,        // Border width in pixels
};
```

## Implementation Details

The magnifier:

1. **Tracks mouse movement** over the canvas and snaps position to the grid
2. **Activates after delay** when mouse stays on a cell for the specified time
3. **Shows magnified view** of the grid cell with 10x enlargement
4. **Displays wallet address** of the cell owner at the bottom (if enabled)
5. **Deactivates immediately** when mouse moves to a different cell

## Usage

The magnifier is automatically activated when:
1. The `IMAGE_MAGNIFIER_ENABLED` feature flag is set to `true`
2. The mouse hovers over a cell for 500ms
3. The canvas is not busy with image placement

The wallet address display can be toggled independently with the `SHOW_OWNER_WALLET` flag.

## Technical Implementation

The implementation uses:
- React hooks for state management and event handling
- CSS grid for precise positioning and scaling
- Direct DOM manipulation for reading canvas content
- Database queries to determine pixel ownership

## Future Enhancements

Potential improvements to consider:
1. Making hover delay customizable through UI settings
2. Adding zoom level control for different magnification factors
3. Improving performance for large canvas with many images
4. Enhancing the wallet display with additional metadata