# Canvas Auto-Arrange Feature Design

## Overview

Add a one-click auto-arrange feature to the infinite canvas that reorganizes scattered session windows into a compact, visually tidy waterfall (masonry) layout.

## Requirements

1. **Layout algorithm**: Waterfall/masonry — place each session into the shortest column
2. **Sort order**: By session id ascending (id is `Date.now()` timestamp string, so lexicographic order equals creation order)
3. **Viewport behavior**: Keep current zoom level, pan so content top-left aligns with viewport top-left
4. **Animation**: Smooth CSS transition from current to target positions
5. **Trigger points**: Bottom toolbar button + right-click context menu on canvas
6. **No undo**: This is a layout convenience tool; users can freely drag windows after arranging

## Layout Algorithm

### Waterfall (Masonry) Placement

1. Sort all sessions by `id` ascending (string comparison; since id = `Date.now().toString()`, this preserves creation order)
2. Get viewport physical width: `containerRef.current.getBoundingClientRect().width`
3. Calculate column count: `columns = Math.max(1, Math.floor(physicalViewportWidth / (SESSION_WIDTH + SESSION_GAP)))`
4. Initialize column heights array: `columnHeights = [START_Y, START_Y, ..., START_Y]`
5. For each session in sorted order:
   - Find the column with the minimum height (`minColIndex`)
   - Assign position:
     - `x = START_X + minColIndex * (SESSION_WIDTH + SESSION_GAP)`
     - `y = columnHeights[minColIndex]`
   - Update column height: `columnHeights[minColIndex] += (session.height || SESSION_DEFAULT_HEIGHT) + SESSION_GAP`
6. After all positions are assigned, set viewport transform to `{x: 0, y: 0, scale: currentScale}` so the canvas origin (near content start) is at viewport top-left

### Constants

- `SESSION_WIDTH = 600` (from `constants.ts`)
- `SESSION_DEFAULT_HEIGHT = 700` (from `constants.ts`)
- `SESSION_GAP = 30` (from `constants.ts`)
- `START_X = 80` (offset to avoid left toolbar overlap)
- `START_Y = 40` (top padding for breathing room)

Note: Column count uses physical viewport width (not divided by scale) because we want consistent column density regardless of zoom level. The algorithm arranges sessions in canvas coordinates.

## Animation

`DraggableSession` currently positions via `left`/`top` CSS properties (not `transform`). Animation must target these properties.

1. Add an `isArranging` state (boolean) to `CanvasView`
2. Add an `arrangingTimeoutRef` (useRef) to track the animation timeout
3. When arranging:
   - Set `isArranging = true`
   - Batch update all session positions to their computed targets via `setSessions()`
   - `DraggableSession` reads `isArranging` and applies: `transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1)`
   - Viewport pans with existing `transition-transform duration-300` class
4. After animation completes (~400ms via `arrangingTimeoutRef`):
   - Set `isArranging = false`
   - Transition removed, normal drag behavior restored
5. If user starts dragging during animation:
   - `DraggableSession` calls `onArrangeCancel()` callback (passed from parent)
   - Parent clears the timeout via `arrangingTimeoutRef` and sets `isArranging = false`
   - Transition is removed immediately, enabling free drag

## Trigger Points

### Bottom Toolbar Button

- Location: After the `Maximize` (reset zoom) button, add a vertical divider then the arrange button, before the existing minimap divider+button
- Icon: `LayoutGrid` from `lucide-react`
- Tooltip: "整理画布"
- Behavior: Calls `handleArrangeSessions()` on click

### Right-Click Context Menu

- Trigger: `onContextMenu` on canvas background div (the one with `transform`). Session windows should call `e.stopPropagation()` on their own `contextmenu` event to prevent canvas menu from appearing on sessions.
- Position: Fixed position using `e.clientX`, `e.clientY` (screen coordinates, not canvas coordinates)
- z-index: `z-[60]` (above toolbar `z-50`)
- Style: Matches existing toolbar aesthetic — `bg-black/40 backdrop-blur-md rounded-xl border border-white/10`
- Menu item: "整理画布" with `LayoutGrid` icon
- Dismiss: Click outside (via backdrop overlay) or press Escape (via `useEffect` keydown listener)
- Behavior: Calls `handleArrangeSessions()` and closes menu

## Data Flow

```
User clicks arrange button / right-click menu
  → handleArrangeSessions()
    → Sort sessions by id ascending
    → Get viewport width from containerRef
    → Compute waterfall positions
    → Set isArranging = true
    → Clear any previous arrangingTimeoutRef
    → Batch update all session positions via setSessions()
    → Set viewport transform to {x: 0, y: 0, scale: currentScale}
    → Set arrangingTimeoutRef = setTimeout(() => setIsArranging(false), 400)
```

## Files to Modify

1. **`src/components/CanvasView.tsx`**:
   - Add `isArranging` state and `arrangingTimeoutRef` ref
   - Add `handleArrangeSessions()` function with waterfall algorithm
   - Add `LayoutGrid` toolbar button after Maximize button
   - Add `onContextMenu` handler on canvas background
   - Add inline context menu (state: `contextMenu: {x, y} | null`)
   - Pass `isArranging` and `onArrangeCancel` to `DraggableSession`

2. **`src/components/CanvasView.tsx` (DraggableSession)**:
   - Accept `isArranging` and `onArrangeCancel` props
   - When `isArranging` is true, apply `transition: left 0.4s ..., top 0.4s ...` to container style
   - On drag start, if `isArranging` is true, call `onArrangeCancel()`
   - Add `onContextMenu={e => e.stopPropagation()}` to prevent canvas context menu on sessions

## Edge Cases

- **0 sessions**: No-op, button still visible but does nothing
- **1 session**: Moves to `(START_X, START_Y)` = `(80, 40)`
- **Viewport width too narrow for 1 column**: `Math.max(1, ...)` ensures minimum 1 column
- **Sessions with no explicit height**: Use `SESSION_DEFAULT_HEIGHT` (700)
- **User drags during animation**: `onArrangeCancel()` clears timeout and resets `isArranging` to false
- **Rapid double-click on arrange**: Previous timeout is cleared before starting new arrangement
