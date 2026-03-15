# Canvas Auto-Arrange Feature Design

## Overview

Add a one-click auto-arrange feature to the infinite canvas that reorganizes scattered session windows into a compact, visually tidy waterfall (masonry) layout.

## Requirements

1. **Layout algorithm**: Waterfall/masonry — place each session into the shortest column
2. **Sort order**: By creation time (earliest top-left, newest bottom-right)
3. **Viewport behavior**: Keep current zoom level, pan to content start point
4. **Animation**: Smooth CSS transition from current to target positions
5. **Trigger points**: Bottom toolbar button + right-click context menu on canvas

## Layout Algorithm

### Waterfall (Masonry) Placement

1. Sort all sessions by creation order (array index / id ascending)
2. Calculate column count: `columns = Math.floor(viewportWidth / (SESSION_WIDTH + SESSION_GAP))`, minimum 1
3. Initialize column heights array: `columnHeights = [0, 0, ..., 0]`
4. For each session in sorted order:
   - Find the column with the minimum height (`minColIndex`)
   - Assign position:
     - `x = 80 + minColIndex * (SESSION_WIDTH + SESSION_GAP)`
     - `y = columnHeights[minColIndex]`
   - Update column height: `columnHeights[minColIndex] += (session.height || SESSION_DEFAULT_HEIGHT) + SESSION_GAP`
5. After all positions are assigned, pan viewport to `(0, 0)` (content start), keep current zoom

### Constants Used

- `SESSION_WIDTH = 600` (from `constants.ts`)
- `SESSION_DEFAULT_HEIGHT = 700` (from `constants.ts`)
- `SESSION_GAP = 30` (from `constants.ts`)
- `START_X = 80` (offset to avoid left toolbar overlap)

## Animation

1. Add an `isArranging` state (boolean) to `CanvasView`
2. When arranging:
   - Set `isArranging = true`
   - Batch update all session positions to their computed targets
   - `DraggableSession` reads `isArranging` and applies CSS transition: `transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)`
   - Viewport pans with existing `transition-transform duration-300` class
3. After animation completes (~400ms timeout):
   - Set `isArranging = false`
   - Transition removed, normal drag behavior restored

## Trigger Points

### Bottom Toolbar Button

- Location: Between the zoom controls group and the minimap toggle button, separated by a vertical divider
- Icon: `LayoutGrid` from `lucide-react`
- Tooltip: "整理画布"
- Behavior: Calls `handleArrangeSessions()` on click

### Right-Click Context Menu

- Trigger: Right-click (`onContextMenu`) on canvas blank area (not on a session window)
- New simple context menu component rendered inside `CanvasView`
- Menu item: "整理画布" with `LayoutGrid` icon
- Dismiss: Click outside or press Escape
- Behavior: Calls `handleArrangeSessions()` and closes menu

## Data Flow

```
User clicks arrange button / right-click menu
  → handleArrangeSessions()
    → Sort sessions by creation order
    → Compute waterfall positions
    → Set isArranging = true
    → Batch update all session positions via setSessions()
    → Pan viewport to (0, 0)
    → After 400ms timeout: set isArranging = false
```

## Files to Modify

1. **`src/components/CanvasView.tsx`**:
   - Add `isArranging` state
   - Add `handleArrangeSessions()` function with waterfall algorithm
   - Add toolbar button with `LayoutGrid` icon
   - Add `onContextMenu` handler on canvas background
   - Add context menu component (inline or extracted)
   - Pass `isArranging` to `DraggableSession` to conditionally apply CSS transition

2. **`src/components/CanvasView.tsx` (DraggableSession)**:
   - Accept `isArranging` prop
   - Conditionally apply `transition` style on the session container

## Edge Cases

- **0 sessions**: No-op, button still visible but does nothing
- **1 session**: Moves to `(80, 0)`
- **Viewport width too narrow for 1 column**: Force `columns = 1`
- **Sessions with no explicit height**: Use `SESSION_DEFAULT_HEIGHT` (700)
- **User drags during animation**: `isArranging` resets to false on any drag start, canceling transition
