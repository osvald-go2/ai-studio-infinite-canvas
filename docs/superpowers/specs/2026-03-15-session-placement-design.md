# Session Placement Design: Grid-First with Collision Avoidance

## Problem

New sessions are placed at `{ x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 }`, causing all sessions to pile up in a 100x100px area with no regard for existing session positions.

## Solution

Grid-first placement with collision avoidance: calculate the ideal grid position for the new session, then check for overlaps with existing sessions. If a collision is detected, advance to the next grid slot until a free position is found.

## Constants

Move `SESSION_WIDTH`, `SESSION_DEFAULT_HEIGHT` from `CanvasView.tsx` to a new shared file `src/constants.ts`, and add the placement constants there.

| Constant | Value | Notes |
|----------|-------|-------|
| `SESSION_WIDTH` | 600px | Moved from `CanvasView.tsx` |
| `SESSION_DEFAULT_HEIGHT` | 700px | Moved from `CanvasView.tsx` |
| `SESSION_MIN_HEIGHT` | 100px | Moved from `CanvasView.tsx` |
| `SESSION_GAP` | 30px | Spacing between sessions |

Derived values computed in `findNextGridPosition`:
- `cellW = SESSION_WIDTH + SESSION_GAP` (630px)
- `cellH = SESSION_DEFAULT_HEIGHT + SESSION_GAP` (730px)

## Algorithm: `findNextGridPosition`

**Inputs:**
- `sessions: Session[]` — all existing sessions (including persisted sessions with non-grid-aligned positions from drag)
- `viewportWidth: number` — actual canvas container width (not `window.innerWidth`, to account for sidebars like GitPanel)

**Output:**
- `{ x: number, y: number }` — position for the new session

**Steps:**

1. Calculate columns per row: `cols = Math.max(1, Math.floor(viewportWidth / cellW))`
2. Starting from `index = 0`, iterate up to `maxAttempts = 100`:
   a. Compute candidate position: `x = (index % cols) * cellW`, `y = Math.floor(index / cols) * cellH`
   b. Check for collision with all existing sessions using AABB overlap test (see below)
   c. If no collision → return `{ x, y }`
   d. If collision → `index++`, continue
3. Fallback (all 100 slots occupied): find `maxX = max(session.position.x + SESSION_WIDTH)` across all sessions, return `{ x: maxX + SESSION_GAP, y: 0 }`

**Collision detection (AABB overlap with margin):**

Expand the existing session's bounding box by `SESSION_GAP` on all sides, then test for plain overlap with the candidate rectangle:

```
existingLeft   = s.position.x - SESSION_GAP
existingRight  = s.position.x + SESSION_WIDTH + SESSION_GAP
existingTop    = s.position.y - SESSION_GAP
existingBottom = s.position.y + (s.height ?? SESSION_DEFAULT_HEIGHT) + SESSION_GAP
```

Overlap exists if all four conditions are true:
- `candidateX < existingRight`
- `candidateX + SESSION_WIDTH > existingLeft`
- `candidateY < existingBottom`
- `candidateY + SESSION_DEFAULT_HEIGHT > existingTop`

Note: `s.height` is `number | undefined` in the Session type; the `??` fallback to `SESSION_DEFAULT_HEIGHT` handles this.

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty canvas (0 sessions) | Place at `(0, 0)` — no collisions to check |
| All 100 grid slots occupied | Fallback: place at `maxX + SESSION_GAP, 0` |
| Sessions dragged to negative coords | Grid search starts at `(0, 0)`; collision check still correctly detects overlap with negative-positioned sessions |
| Persisted sessions with non-grid positions | Handled by collision detection — any arbitrary position is checked against |
| Rapid session creation | Use `setSessions(prev => ...)` functional updater to avoid stale closure; compute `findNextGridPosition` inside the updater callback with `prev` as input |
| maxAttempts = 100 | Supports ~100 concurrent sessions before fallback, sufficient for expected usage |

## Code Changes

### New file: `src/constants.ts`

Move session dimension constants from `CanvasView.tsx`:
- `SESSION_WIDTH = 600`
- `SESSION_DEFAULT_HEIGHT = 700`
- `SESSION_MIN_HEIGHT = 100`
- Add `SESSION_GAP = 30`

### File: `src/components/CanvasView.tsx`

- Remove local `SESSION_WIDTH`, `SESSION_DEFAULT_HEIGHT`, `SESSION_MIN_HEIGHT` constants
- Import them from `@/constants`

### File: `src/App.tsx`

1. Import constants from `@/constants`
2. Add `findNextGridPosition(sessions: Session[], viewportWidth: number): { x: number; y: number }` function above the `App` component
3. Add a `canvasWidthRef = useRef(window.innerWidth)` in App, and pass a callback `onCanvasResize={(w) => canvasWidthRef.current = w}` to `CanvasView`, which calls it from a `ResizeObserver` on the canvas container. This gives App access to the actual canvas container width at all times.
4. In `handleCreateSession`, replace the random position with:
   ```typescript
   setSessions(prev => {
     const position = findNextGridPosition(prev, canvasWidthRef.current);
     const newSession: Session = { ...sessionData, position };
     return [...prev, newSession];
   });
   ```

### No other files need changes.
