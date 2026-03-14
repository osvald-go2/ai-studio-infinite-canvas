# Unify UI Color Scheme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded background colors across 10 component files to unify the UI into a single neutral cool-gray palette with warm amber input accents.

**Architecture:** Direct find-and-replace of Tailwind CSS class values. No structural changes, no new files, no CSS variables. Three color tiers: Base (`#1A1A2E`), Deep (`#2B2D3A`), Card (`#3B3F4F`).

**Tech Stack:** React + Tailwind CSS 4 (utility classes only)

**Spec:** `docs/superpowers/specs/2026-03-14-unify-color-scheme-design.md`

---

## Chunk 1: Core Layout & Modals

### Task 1: App root background

**Files:**
- Modify: `src/App.tsx:76`

- [ ] **Step 1: Replace bg-neutral-900 with bg-[#1A1A2E]**

In `src/App.tsx` line 76, replace:
```
bg-neutral-900
```
with:
```
bg-[#1A1A2E]
```

- [ ] **Step 2: Verify dev server renders correctly**

Run: `npm run dev`
Open browser, confirm the app background is now a deep blue-gray instead of neutral gray.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "style: update App root background to unified base color #1A1A2E"
```

### Task 2: NewSessionModal

**Files:**
- Modify: `src/components/NewSessionModal.tsx:58`

- [ ] **Step 1: Replace bg-[#2A2421]/95 with bg-[#3B3F4F]/95**

In `src/components/NewSessionModal.tsx` line 58, replace:
```
bg-[#2A2421]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Visual check**

Open the New Session modal (click "+" or "New Session" in the TopBar). Confirm it now matches the cool gray tone instead of the old warm brown.

- [ ] **Step 3: Commit**

```bash
git add src/components/NewSessionModal.tsx
git commit -m "style: update NewSessionModal background to unified card color"
```

### Task 3: DiffModal

**Files:**
- Modify: `src/components/DiffModal.tsx:41`

- [ ] **Step 1: Replace bg-[#2A2421]/95 with bg-[#3B3F4F]/95**

In `src/components/DiffModal.tsx` line 41, replace:
```
bg-[#2A2421]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DiffModal.tsx
git commit -m "style: update DiffModal background to unified card color"
```

## Chunk 2: Session & Code Components

### Task 4: SessionWindow

**Files:**
- Modify: `src/components/SessionWindow.tsx:201,297,373`

- [ ] **Step 1: Replace container background (line 201)**

Replace:
```
bg-[#3A3D4A]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Replace input accent background (line 297)**

Replace:
```
bg-[#9A6A45]/30
```
with:
```
bg-[rgba(160_120_65_0.3)]
```

- [ ] **Step 3: Replace code block background (line 373)**

Replace:
```
bg-[#23252E]
```
with:
```
bg-[#2B2D3A]
```

- [ ] **Step 4: Visual check**

Open a session in Canvas view. Verify:
- Session window background is unified cool gray
- Input box retains warm amber accent
- Code blocks in mock content use the new deep color

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionWindow.tsx
git commit -m "style: update SessionWindow colors to unified palette"
```

### Task 5: CodeBlock

**Files:**
- Modify: `src/components/CodeBlock.tsx:15`

- [ ] **Step 1: Replace bg-[#1E2023]/80 with bg-[#2B2D3A]/80**

In `src/components/CodeBlock.tsx` line 15, replace:
```
bg-[#1E2023]/80
```
with:
```
bg-[#2B2D3A]/80
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CodeBlock.tsx
git commit -m "style: update CodeBlock background to unified deep color"
```

## Chunk 3: Navigation & Sidebars

### Task 6: TopBar dropdowns

**Files:**
- Modify: `src/components/TopBar.tsx:74,159`

- [ ] **Step 1: Replace both bg-[#2A2421]/95 instances with bg-[#3B3F4F]/95**

Line 74 (project-switcher dropdown) and line 159 (search-results dropdown) — replace all instances of:
```
bg-[#2A2421]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Visual check**

Click the project switcher and search bar in the TopBar. Confirm dropdowns use the new card color.

- [ ] **Step 3: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "style: update TopBar dropdown backgrounds to unified card color"
```

### Task 7: GitSidebar

**Files:**
- Modify: `src/components/GitSidebar.tsx:45`

- [ ] **Step 1: Replace bg-[#1A1512]/95 with bg-[#2B2D3A]/95**

In `src/components/GitSidebar.tsx` line 45, replace:
```
bg-[#1A1512]/95
```
with:
```
bg-[#2B2D3A]/95
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GitSidebar.tsx
git commit -m "style: update GitSidebar background to unified deep color"
```

## Chunk 4: View Modes

### Task 8: TabView

**Files:**
- Modify: `src/components/TabView.tsx:37,98`

- [ ] **Step 1: Replace left sidebar background (line 37)**

Replace:
```
bg-[#1A1512]/80
```
with:
```
bg-[#2B2D3A]/80
```

- [ ] **Step 2: Replace right panel background (line 98)**

Replace:
```
bg-[#14100E]
```
with:
```
bg-[#1A1A2E]
```

- [ ] **Step 3: Visual check**

Switch to Tab view. Confirm left sidebar and right panel use the new colors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabView.tsx
git commit -m "style: update TabView backgrounds to unified palette"
```

### Task 9: BoardView

**Files:**
- Modify: `src/components/BoardView.tsx:230`

- [ ] **Step 1: Replace bg-[#3A3D4A]/95 with bg-[#3B3F4F]/95**

In `src/components/BoardView.tsx` line 230, replace:
```
bg-[#3A3D4A]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BoardView.tsx
git commit -m "style: update BoardView sidebar background to unified card color"
```

### Task 10: CanvasView broadcast input

**Files:**
- Modify: `src/components/CanvasView.tsx:254`

- [ ] **Step 1: Replace bg-[#2A2421]/95 with bg-[#3B3F4F]/95**

In `src/components/CanvasView.tsx` line 254, replace:
```
bg-[#2A2421]/95
```
with:
```
bg-[#3B3F4F]/95
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CanvasView.tsx
git commit -m "style: update CanvasView broadcast input to unified card color"
```

## Chunk 5: Final Verification

### Task 11: Cross-view visual verification

- [ ] **Step 1: Run type check**

Run: `npm run lint`
Expected: No new type errors (these are CSS-only changes).

- [ ] **Step 2: Visual verification across all views**

With `npm run dev` running, check:
1. **Canvas view** — session windows, broadcast input bar, new session modal all share the same gray tone
2. **Board view** — sidebar detail panel matches session cards
3. **Tab view** — left sidebar and right panel use cohesive colors
4. **TopBar** — project switcher and search dropdowns match
5. **GitSidebar** — blends with the new scheme
6. **DiffModal** — matches the unified palette
7. **Hover/focus states** — still provide visible contrast changes

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors.
