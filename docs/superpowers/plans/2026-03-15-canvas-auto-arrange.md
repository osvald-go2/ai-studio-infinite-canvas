# Canvas Auto-Arrange Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click auto-arrange feature that reorganizes scattered canvas session windows into a compact waterfall (masonry) layout with smooth animation.

**Architecture:** A `handleArrangeSessions()` function in `CanvasView` computes waterfall positions and batch-updates all sessions. An `isArranging` boolean state controls CSS transitions on `DraggableSession`. Two trigger points: toolbar button and right-click context menu.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-15-canvas-auto-arrange-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/constants.ts` | Modify | Add `START_X`, `START_Y` constants |
| `src/components/CanvasView.tsx` | Modify | Add arrange logic, toolbar button, context menu, animation state; update `DraggableSession` props |

---

## Chunk 1: Implementation

### Task 1: Add layout constants

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Add START_X and START_Y constants**

In `src/constants.ts`, append after the last line:

```typescript
export const START_X = 80;
export const START_Y = 40;
```

- [ ] **Step 2: Verify types**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat(canvas): add START_X and START_Y layout constants"
```

---

### Task 2: Implement auto-arrange feature in CanvasView

All CanvasView changes are in a single task to ensure every commit passes type checks. Changes span both the `CanvasView` parent component and the `DraggableSession` child component within the same file.

**Files:**
- Modify: `src/components/CanvasView.tsx`

- [ ] **Step 1: Update imports**

Update the lucide-react import (find `import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, Send, Map }`) to add `LayoutGrid`:

```typescript
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, Send, Map, LayoutGrid } from 'lucide-react';
```

Update the constants import (find `import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_MIN_HEIGHT }`) to add `SESSION_GAP`, `START_X`, `START_Y`:

```typescript
import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_MIN_HEIGHT, SESSION_GAP, START_X, START_Y } from '@/constants';
```

- [ ] **Step 2: Add state and refs in CanvasView**

Inside `CanvasView` function, after `const [showMinimap, setShowMinimap] = useState(true);`, add:

```typescript
const [isArranging, setIsArranging] = useState(false);
const arrangingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
```

- [ ] **Step 3: Add Escape key listener for context menu**

After the new state declarations from Step 2, add:

```typescript
useEffect(() => {
  if (!contextMenu) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setContextMenu(null);
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [contextMenu]);
```

- [ ] **Step 4: Add handleArrangeSessions and handleArrangeCancel**

After the `handleBroadcast` function (find `setBroadcastMessage('');` and the closing `};` of that function), add:

```typescript
const handleArrangeSessions = useCallback(() => {
  if (sessions.length === 0) return;

  const container = containerRef.current;
  if (!container) return;

  const viewportWidth = container.getBoundingClientRect().width;
  const columns = Math.max(1, Math.floor(viewportWidth / (SESSION_WIDTH + SESSION_GAP)));
  const columnHeights = new Array(columns).fill(START_Y);

  const sorted = [...sessions].sort((a, b) => a.id.localeCompare(b.id));
  const updates: Record<string, { x: number; y: number }> = {};

  for (const session of sorted) {
    const minCol = columnHeights.indexOf(Math.min(...columnHeights));
    updates[session.id] = {
      x: START_X + minCol * (SESSION_WIDTH + SESSION_GAP),
      y: columnHeights[minCol],
    };
    columnHeights[minCol] += (session.height ?? SESSION_DEFAULT_HEIGHT) + SESSION_GAP;
  }

  if (arrangingTimeoutRef.current) {
    clearTimeout(arrangingTimeoutRef.current);
  }

  setIsArranging(true);
  setSessions((prev: Session[]) =>
    prev.map(s => updates[s.id] ? { ...s, position: updates[s.id] } : s)
  );
  setTransform(prev => ({ ...prev, x: 0, y: 0 }));

  arrangingTimeoutRef.current = setTimeout(() => {
    setIsArranging(false);
    arrangingTimeoutRef.current = null;
  }, 400);
}, [sessions, setSessions, setTransform]);

const handleArrangeCancel = useCallback(() => {
  if (arrangingTimeoutRef.current) {
    clearTimeout(arrangingTimeoutRef.current);
    arrangingTimeoutRef.current = null;
  }
  setIsArranging(false);
}, []);
```

- [ ] **Step 5: Pass new props to DraggableSession**

In the `sessions.map()` JSX, add two new props to each `<DraggableSession>` after `onCopySession={onCopySession}`:

```tsx
isArranging={isArranging}
onArrangeCancel={handleArrangeCancel}
```

- [ ] **Step 6: Add onContextMenu on canvas transform div**

On the canvas transform div (find `className="absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-out"`), add an `onContextMenu` handler:

```tsx
onContextMenu={(e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.session-container')) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }
}}
```

- [ ] **Step 7: Add arrange button to toolbar**

In the zoom controls div (find `className="absolute bottom-6 right-6 flex items-center gap-2 bg-black/40"`), after the `Maximize` (Reset View) button, replace the existing divider before Minimap:

Find the divider + minimap button block:
```tsx
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button
          onClick={() => setShowMinimap(v => !v)}
```

Replace with (adding arrange button + its own divider before the minimap divider):
```tsx
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button
          onClick={handleArrangeSessions}
          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 transition-colors"
          title="整理画布"
        >
          <LayoutGrid size={18} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button
          onClick={() => setShowMinimap(v => !v)}
```

Toolbar order: ZoomIn | % | ZoomOut | divider | Maximize | divider | **Arrange** | divider | Minimap

- [ ] **Step 8: Add context menu JSX**

After the zoom controls `</div>` closing tag, before the closing `</div>` of the container, add:

```tsx
{/* Context Menu */}
{contextMenu && (
  <>
    <div
      className="fixed inset-0 z-[59]"
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
    />
    <div
      className="fixed z-[60] bg-black/40 backdrop-blur-md rounded-xl border border-white/10 py-1.5 shadow-2xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        onClick={() => {
          handleArrangeSessions();
          setContextMenu(null);
        }}
        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/10 w-full transition-colors"
      >
        <LayoutGrid size={16} />
        整理画布
      </button>
    </div>
  </>
)}
```

- [ ] **Step 9: Update DraggableSession props type and destructuring**

In the `DraggableSession` function, add new props.

Props type — find `onCopySession?: (title: string) => void,` in the type annotation, add after it:

```typescript
isArranging?: boolean,
onArrangeCancel?: () => void,
```

Destructuring — find `onCopySession,` in the destructuring, add after it:

```typescript
isArranging,
onArrangeCancel,
```

- [ ] **Step 10: Cancel arrange on drag start in DraggableSession**

In `handleMouseDownCapture`, inside the `else if (toolMode === 'hand')` block, before `e.stopPropagation();` (inside `if (isGroupDrag && !isInteractive)`), add:

```typescript
if (isArranging) {
  onArrangeCancel?.();
}
```

In `handleMouseDown`, at the start of the `if (canDrag)` block (before `e.stopPropagation();`), add:

```typescript
if (isArranging) {
  onArrangeCancel?.();
}
```

- [ ] **Step 11: Add transition style and contextmenu stopPropagation to DraggableSession container**

On the outer `<div>` of DraggableSession, find:
```tsx
style={{ left: session.position.x, top: session.position.y }}
```

Replace with:
```tsx
style={{
  left: session.position.x,
  top: session.position.y,
  transition: isArranging ? 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
}}
onContextMenu={(e) => e.stopPropagation()}
```

- [ ] **Step 12: Verify types**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 13: Manual test**

Run: `npm run dev`

Verify:
1. Open canvas view with multiple sessions
2. Click the `LayoutGrid` button in bottom toolbar — sessions animate into waterfall layout
3. Right-click on canvas blank area — context menu appears with "整理画布"
4. Click "整理画布" in context menu — same arrange behavior
5. Press Escape — context menu closes
6. Right-click on a session window — no canvas context menu (browser default instead)
7. During animation, drag a session — animation cancels immediately, normal drag works
8. Arrange with different zoom levels — column count stays consistent
9. Arrange with 0 sessions — nothing happens (no error)
10. Rapid double-click arrange button — no glitches

- [ ] **Step 14: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "feat(canvas): add auto-arrange with waterfall layout, toolbar button, and context menu"
```
