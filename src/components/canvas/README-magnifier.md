# Canvas Magnifier Implementation

This directory contains a selection-based magnifier implementation for the canvas component.

## Overview

The magnifier allows users to select a portion of the canvas by clicking and dragging to create a magnified view. This is useful for inspecting details on the canvas, especially when dealing with small images or detailed grids.

## Features

- **Selection-based**: Users create a magnifier by dragging to select an area
- **Draggable**: The magnifier can be moved around the canvas
- **Resizable**: The magnifier can be resized using handles
- **Keyboard Control**: Press 'Delete' or 'Escape' to remove a magnifier

## Implementation

The main components are:

1. **SelectionMagnifier.tsx**: Contains the main implementation of the magnifier
2. **Constants.ts**: Contains configuration options for the magnifier

## How to Use

1. Enable the magnifier in constants.ts by setting:
   ```typescript
   FEATURES.IMAGE_MAGNIFIER_ENABLED = true
   ```

2. When the canvas is not busy with image placement, users can:
   - Click and drag on the canvas to create a magnifier
   - Drag the magnifier by clicking inside it and moving
   - Resize the magnifier using the resize handles
   - Delete the magnifier by pressing Escape or Delete

## Configuration

The magnifier can be configured in `src/utils/constants.ts`:

```typescript
export const MAGNIFIER = {
  DEFAULT_SIZE: 150,     // Initial size when created
  ZOOM_FACTOR: 2.0,      // Default zoom level
  BORDER_WIDTH: 2,       // Border width in pixels
  BORDER_COLOR: '#3B82F6', // Border color (blue)
  MIN_SIZE: 40,          // Minimum magnifier size
};
```

## Implementation Notes

- The magnifier displays properly with the canvas grid background
- The implementation is optimized for performance
- The magnifier is disabled during image placement to avoid interference
- Resize handles appear when the magnifier is selected
- All interactions are blocked by an invisible overlay to ensure proper event handling

## Future Enhancements

Potential improvements could include:

1. Adding zoom controls to adjust magnification level
2. Adding a color picker for customizing the border color
3. Saving magnifier positions in localStorage for persistence
4. Ability to have multiple magnifiers simultaneously