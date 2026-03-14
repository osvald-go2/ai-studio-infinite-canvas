# Session Editable Title

## Problem

Canvas view session windows do not display their title. The title is only visible in fullscreen (TabView) mode. Users need to see and edit session titles directly on the canvas.

## Design

Add an inline-editable title to the SessionWindow header, visible in all view modes.

### Display

- Remove the `fullScreen &&` guard on the title — show it in all modes
- Title appears in the header, to the right of the close button
- Style: white text, `font-medium`, single line with `truncate` for overflow, `max-w-[200px]` in non-fullscreen to prevent layout issues
- Fullscreen mode: keep `text-lg` size; non-fullscreen: use `text-sm`

### Editing Interaction

- **Double-click** the title text to enter edit mode
- Title text is replaced inline with an `<input>`, auto-focused with text fully selected
- **Enter** or **blur** saves the new title via `onUpdate`
- **Escape** cancels editing and restores the original value
- Empty string is rejected — reverts to previous title
- `maxLength={100}` on the input to prevent excessively long titles

### Drag-handle Coexistence

The `.session-header` serves as the drag handle in CanvasView. To prevent conflicts:

- The `<input>` (when in edit mode) must call `e.stopPropagation()` on `mousedown` so that clicking/selecting text inside the input does not trigger a drag
- The title `<span>` does **not** stop propagation — it remains part of the draggable header area. The `dblclick` handler enters edit mode; single-click/drag still moves the window as before
- The `<input>` keydown handler calls `e.stopPropagation()` to prevent interference with other handlers

### Scope

- Primary change: `src/components/SessionWindow.tsx`
- No type changes needed (`Session.title` already exists)
- No new dependencies

### State

- Local `isEditingTitle` boolean + `editTitle` string state in SessionWindow
- `editTitle` is initialized to `session.title` on double-click (not kept in sync at all times), enabling proper cancel-on-Escape
- On save: `onUpdate({ ...session, title: editTitle.trim() || session.title })`
