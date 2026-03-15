# Session Placement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace random session placement with grid-first + collision avoidance so new sessions tile neatly across the canvas.

**Architecture:** Extract session dimension constants to a shared file. Add a pure function `findNextGridPosition` that scans grid slots left-to-right, top-to-bottom, skipping any that collide with existing sessions. Thread actual canvas container width from CanvasView to App via a ref + ResizeObserver callback.

**Tech Stack:** React 19, TypeScript, Vite

---

## Chunk 1: Extract constants & implement placement logic

### Task 1: Create shared constants file

**Files:**
- Create: `src/constants.ts`

- [ ] **Step 1: Create `src/constants.ts`**

```typescript
export const SESSION_WIDTH = 600;
export const SESSION_DEFAULT_HEIGHT = 700;
export const SESSION_MIN_HEIGHT = 100;
export const SESSION_GAP = 30;
```

- [ ] **Step 2: Commit**

```bash
git add src/constants.ts
git commit -m "refactor: extract session dimension constants to shared file"
```

### Task 2: Update CanvasView to import from constants

**Files:**
- Modify: `src/components/CanvasView.tsx:6-8`

- [ ] **Step 1: Replace local constants with imports**

Remove these three lines at the top of `CanvasView.tsx`:
```typescript
const SESSION_WIDTH = 600;
const SESSION_DEFAULT_HEIGHT = 700;
const SESSION_MIN_HEIGHT = 100;
```

Add this import:
```typescript
import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_MIN_HEIGHT } from '@/constants';
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "refactor: CanvasView imports constants from shared file"
```

### Task 3: Add `findNextGridPosition` to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the `findNextGridPosition` function above the `App` component**

Insert after the imports, before `export default function App()`:

```typescript
import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_GAP } from '@/constants';

function findNextGridPosition(
  sessions: Session[],
  viewportWidth: number
): { x: number; y: number } {
  const cellW = SESSION_WIDTH + SESSION_GAP;
  const cellH = SESSION_DEFAULT_HEIGHT + SESSION_GAP;
  const cols = Math.max(1, Math.floor(viewportWidth / cellW));
  const maxAttempts = 100;

  for (let index = 0; index < maxAttempts; index++) {
    const x = (index % cols) * cellW;
    const y = Math.floor(index / cols) * cellH;

    const hasCollision = sessions.some(s => {
      const eLeft = s.position.x - SESSION_GAP;
      const eRight = s.position.x + SESSION_WIDTH + SESSION_GAP;
      const eTop = s.position.y - SESSION_GAP;
      const eBottom = s.position.y + (s.height ?? SESSION_DEFAULT_HEIGHT) + SESSION_GAP;

      return x < eRight && x + SESSION_WIDTH > eLeft && y < eBottom && y + SESSION_DEFAULT_HEIGHT > eTop;
    });

    if (!hasCollision) {
      return { x, y };
    }
  }

  // Fallback: place after the rightmost session
  const maxX = sessions.reduce((max, s) => Math.max(max, s.position.x + SESSION_WIDTH), 0);
  return { x: maxX + SESSION_GAP, y: 0 };
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add findNextGridPosition placement function"
```

### Task 4: Wire up placement in `handleCreateSession`

**Files:**
- Modify: `src/App.tsx:226-246`

- [ ] **Step 1: Add a `canvasWidthRef` in the App component**

Inside `App()`, after the existing refs (around line 40), add:

```typescript
const canvasWidthRef = useRef(window.innerWidth);
```

- [ ] **Step 2: Replace random position with grid placement in `handleCreateSession`**

Replace the current `handleCreateSession` function (lines 226-246):

```typescript
const handleCreateSession = (title: string, model: string, gitBranch: string, worktree: string, initialPrompt: string) => {
  setSessions(prev => {
    const position = findNextGridPosition(prev, canvasWidthRef.current);
    const newSession: Session = {
      id: Date.now().toString(),
      title,
      model,
      gitBranch,
      worktree,
      status: 'inbox',
      position,
      messages: initialPrompt.trim() ? [{
        id: Date.now().toString() + '-init',
        role: 'user',
        content: initialPrompt.trim(),
        type: 'text'
      }] : []
    };
    return [...prev, newSession];
  });
};
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: use grid placement for new sessions"
```

## Chunk 2: Thread canvas container width

### Task 5: Add `onCanvasResize` callback from CanvasView

**Files:**
- Modify: `src/components/CanvasView.tsx:10-26`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `onCanvasResize` prop to CanvasView**

In `CanvasView.tsx`, add `onCanvasResize` to the props type and destructuring:

```typescript
export function CanvasView({
  sessions,
  setSessions,
  onOpenReview,
  focusedSessionId,
  projectDir,
  transform,
  onTransformChange,
  onCanvasResize,
}: {
  sessions: Session[],
  setSessions: any,
  onOpenReview: (id: string) => void,
  focusedSessionId?: string | null,
  projectDir?: string | null,
  transform: { x: number; y: number; scale: number },
  onTransformChange: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>,
  onCanvasResize?: (width: number) => void,
}) {
```

- [ ] **Step 2: Add ResizeObserver to CanvasView**

Inside CanvasView, after the existing `containerRef` declaration (around line 30), add a `useEffect` that observes the container's width:

```typescript
useEffect(() => {
  if (!containerRef.current || !onCanvasResize) return;
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      onCanvasResize(entry.contentRect.width);
    }
  });
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, [onCanvasResize]);
```

- [ ] **Step 3: Pass `onCanvasResize` from App.tsx**

In `App.tsx`, update the `<CanvasView>` JSX to pass the callback:

```tsx
<CanvasView
  sessions={sessions}
  setSessions={setSessions}
  onOpenReview={(sessionId) => setReviewSessionId(sessionId)}
  focusedSessionId={focusedSessionId}
  projectDir={projectDir}
  transform={canvasTransform}
  onTransformChange={setCanvasTransform}
  onCanvasResize={(w) => { canvasWidthRef.current = w; }}
/>
```

- [ ] **Step 4: Verify the app compiles**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 5: Manual test**

Run: `npm run dev`

1. Open browser at `localhost:3000`
2. Create 3+ new sessions — they should tile left-to-right, then wrap to next row
3. Drag one session to a new position, create another — it should avoid the dragged session
4. Resize browser window, create a session — column count should adapt

- [ ] **Step 6: Commit**

```bash
git add src/components/CanvasView.tsx src/App.tsx
git commit -m "feat: thread canvas container width for accurate grid placement"
```
