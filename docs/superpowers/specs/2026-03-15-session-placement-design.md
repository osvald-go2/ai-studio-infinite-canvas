# Session Placement Design: Grid-First with Collision Avoidance

## Problem

New sessions are placed at `{ x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 }`, causing all sessions to pile up in a 100x100px area with no regard for existing session positions.

## Solution

Grid-first placement with collision avoidance: calculate the ideal grid position for the new session, then check for overlaps with existing sessions. If a collision is detected, advance to the next grid slot until a free position is found.

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| `SESSION_WIDTH` | 600px | Already defined in `CanvasView.tsx` |
| `SESSION_DEFAULT_HEIGHT` | 700px | Already defined in `CanvasView.tsx` |
| `GAP` | 30px | Spacing between sessions |
| `cellW` | 630px | `SESSION_WIDTH + GAP` |
| `cellH` | 730px | `SESSION_DEFAULT_HEIGHT + GAP` |

## Algorithm: `findNextGridPosition`

**Inputs:**
- `sessions: Session[]` — all existing sessions
- `viewportWidth: number` — `window.innerWidth`

**Output:**
- `{ x: number, y: number }` — position for the new session

**Steps:**

1. Calculate columns per row: `cols = Math.max(1, Math.floor(viewportWidth / cellW))`
2. Starting from `index = 0`, iterate up to `maxAttempts = 100`:
   a. Compute candidate position: `x = (index % cols) * cellW`, `y = Math.floor(index / cols) * cellH`
   b. Check for collision: does the rectangle `(x, y, x + SESSION_WIDTH, y + SESSION_DEFAULT_HEIGHT)` overlap with any existing session's bounding box (using each session's actual `height` or `SESSION_DEFAULT_HEIGHT` as fallback), with `GAP` as margin?
   c. If no collision → return `{ x, y }`
   d. If collision → `index++`, continue
3. Fallback (all 100 slots occupied): find `maxX = max(session.position.x + SESSION_WIDTH)` across all sessions, return `{ x: maxX + GAP, y: 0 }`

**Collision detection (AABB overlap with margin):**

Two rectangles overlap if all four conditions are true:
- `newLeft < existingRight + GAP`
- `newRight + GAP > existingLeft`
- `newTop < existingBottom + GAP`
- `newBottom + GAP > existingTop`

Where:
- New session: `newLeft = x`, `newRight = x + SESSION_WIDTH`, `newTop = y`, `newBottom = y + SESSION_DEFAULT_HEIGHT`
- Existing session: `existingLeft = s.position.x`, `existingRight = s.position.x + SESSION_WIDTH`, `existingTop = s.position.y`, `existingBottom = s.position.y + (s.height ?? SESSION_DEFAULT_HEIGHT)`

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty canvas (0 sessions) | Place at `(0, 0)` |
| All grid slots occupied | Fallback: place at `maxX + GAP, 0` |
| Sessions dragged to negative coords | Ignored by grid search (grid starts at 0,0); collision check still works correctly |

## Code Changes

### File: `src/App.tsx`

1. Extract `findNextGridPosition(sessions, viewportWidth)` as a standalone function (or place it above `App` component)
2. In `handleCreateSession`, replace:
   ```typescript
   position: { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 }
   ```
   with:
   ```typescript
   position: findNextGridPosition(sessions, window.innerWidth)
   ```

### File: `src/components/CanvasView.tsx`

- Export `SESSION_WIDTH` and `SESSION_DEFAULT_HEIGHT` so `App.tsx` can import them (or move constants to a shared file)

### No other files need changes.
