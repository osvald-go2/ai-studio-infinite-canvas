# Session Editable Title Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline-editable title to the SessionWindow header, visible in all view modes.

**Architecture:** Add local state (`isEditingTitle`, `editTitle`) and a `titleInputRef` to SessionWindow. Replace the fullscreen-only `<h2>` with a conditional render: `<span>` (display) or `<input>` (editing), shown in all modes. Double-click toggles edit mode.

**Tech Stack:** React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-14-session-editable-title-design.md`

---

### Task 1: Add title editing state and ref

**Files:**
- Modify: `src/components/SessionWindow.tsx:20-26`

- [ ] **Step 1: Add state and ref declarations**

After the existing state declarations (line 22), add:

```tsx
const [isEditingTitle, setIsEditingTitle] = useState(false);
const [editTitle, setEditTitle] = useState('');
const titleInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add save and cancel handlers**

After the `handleKeyDown` function (line 211), add:

```tsx
const handleTitleSave = () => {
  const newTitle = editTitle.trim();
  if (newTitle && newTitle !== session.title) {
    onUpdate({ ...session, title: newTitle });
  }
  setIsEditingTitle(false);
};

const handleTitleCancel = () => {
  setIsEditingTitle(false);
};

const handleTitleDoubleClick = () => {
  setEditTitle(session.title);
  setIsEditingTitle(true);
};
```

- [ ] **Step 3: Add useEffect to auto-focus and select input on edit mode**

```tsx
useEffect(() => {
  if (isEditingTitle && titleInputRef.current) {
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }
}, [isEditingTitle]);
```

---

### Task 2: Replace the title rendering in the header

**Files:**
- Modify: `src/components/SessionWindow.tsx:221-228`

- [ ] **Step 1: Replace the header title section**

Replace line 227:
```tsx
{fullScreen && <h2 className="font-medium text-white text-lg">{session.title}</h2>}
```

With:
```tsx
{isEditingTitle ? (
  <input
    ref={titleInputRef}
    value={editTitle}
    onChange={(e) => setEditTitle(e.target.value)}
    onBlur={handleTitleSave}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        handleTitleSave();
      } else if (e.key === 'Escape') {
        handleTitleCancel();
      }
    }}
    onMouseDown={(e) => e.stopPropagation()}
    maxLength={100}
    className={`bg-transparent border-b border-white/30 outline-none font-medium text-white ${
      fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
    }`}
  />
) : (
  <span
    onDoubleClick={handleTitleDoubleClick}
    className={`font-medium text-white truncate cursor-default ${
      fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
    }`}
  >
    {session.title}
  </span>
)}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev` (already running on port 3001)

Verify:
1. Canvas view: session windows now show title in header
2. Double-click title → input appears, focused, text selected
3. Type new title, press Enter → title updates
4. Double-click, press Escape → reverts to original
5. Double-click, clear text, blur → reverts to original (no empty title)
6. Drag session by header still works (single click + drag)
7. Tab view fullscreen: title also shows and is editable

- [ ] **Step 3: Run type check**

Run: `npm run lint`
Expected: No TypeScript errors
