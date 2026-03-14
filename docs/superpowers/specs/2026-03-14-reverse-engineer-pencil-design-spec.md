# AI Studio Infinite Canvas — Pencil Design Spec

**Date:** 2026-03-14
**Goal:** Reverse-engineer the React app UI into a 1:1 faithful pencil (.pen) design file.
**Output:** New `.pen` file at project root (e.g., `ai-studio-infinite-canvas.pen`)
**Approach:** Design System + Screens (Hybrid) — tokens first, then reusable components, then full pages.

---

## 1. Design Tokens (Variables)

All colors extracted from Tailwind classes in the React codebase. Defined as pencil variables so every node references tokens, not hardcoded hex values.

### Backgrounds

| Variable | Value | Source |
|---|---|---|
| `bg-primary` | `#171717` | `bg-neutral-900` |
| `bg-black` | `#000000` | `bg-black` |
| `bg-surface` | `#2A2421` | Modal/sidebar bg |
| `bg-card` | `#3A3D4A` | SessionWindow card |
| `bg-sidebar` | `#1A1512` | TabView sidebar |
| `bg-content` | `#14100E` | TabView content area |
| `bg-input` | `#9A6A45` | Chat input tint (used at 30% opacity) |

### Borders

| Variable | Value | Source |
|---|---|---|
| `border-default` | `#FFFFFF1A` | `white/10` |
| `border-subtle` | `#FFFFFF0D` | `white/5` |
| `border-focus` | `#FFFFFF33` | `white/20` |

### Text

| Variable | Value | Source |
|---|---|---|
| `text-primary` | `#FFFFFF` | white |
| `text-secondary` | `#E5E7EB` | gray-200 |
| `text-tertiary` | `#D1D5DB` | gray-300 |
| `text-muted` | `#9CA3AF` | gray-400 |
| `text-disabled` | `#6B7280` | gray-500 |

### Status Colors

| Variable | Value | Usage |
|---|---|---|
| `status-inbox` | `#D1D5DB` | gray-300 |
| `status-inprocess` | `#93C5FD` | blue-300 |
| `status-review` | `#FCD34D` | amber-300 |
| `status-done` | `#6EE7B7` | emerald-300 |
| `status-inbox-bg` | `#6B728033` | gray-500/20 |
| `status-inprocess-bg` | `#3B82F633` | blue-500/20 |
| `status-review-bg` | `#F59E0B33` | amber-500/20 |
| `status-done-bg` | `#10B98133` | emerald-500/20 |

### Interactive / Accent

| Variable | Value | Source |
|---|---|---|
| `interactive-bg` | `#FFFFFF1A` | `white/10` |
| `interactive-hover` | `#FFFFFF33` | `white/20` |
| `accent-blue` | `#3B82F6` | Selection / active |
| `accent-orange` | `#FB923C` | Brand gradient start (orange-400) |
| `accent-rose` | `#FB7185` | Brand gradient end (rose-400) |
| `accent-red` | `#EF4444` | Destructive (red-500) |

### Radii / Spacing

| Variable | Value | Usage |
|---|---|---|
| `radius-card` | `32` | SessionWindow |
| `radius-modal` | `32` | Modals |
| `radius-button` | `12` | Buttons |
| `radius-input` | `24` | Chat input |
| `radius-badge` | `100` | Fully rounded badges |

---

## 2. Reusable Components (16 total)

All placed in a "Design System" frame on the canvas, separate from page designs.

### Basic Components

#### 2.1 IconButton
- Size: 32x32, corner radius 8
- Fill: transparent (hover: `$interactive-bg`)
- Child: lucide icon_font 16x16, fill `$text-muted`
- Layout: horizontal, center/center

#### 2.2 GhostButton
- Fill: `$interactive-bg` (hover: `$interactive-hover`)
- Padding: [8, 16], corner radius `$radius-button`
- Child: text 14px, fill `$text-secondary`
- Layout: horizontal, center/center, gap 8

#### 2.3 PrimaryButton
- Fill: `$accent-blue` at ~80% opacity (`#3B82F6CC`)
- Padding: [10, 20], corner radius `$radius-button`
- Child: text 14px semibold, fill `$text-primary`
- Layout: horizontal, center/center, gap 8

#### 2.4 StatusBadge
- Fill: `$status-inbox-bg` (default, overridden per instance)
- Padding: [2, 8], corner radius `$radius-badge`
- Child: text 11px uppercase, fill `$status-inbox` (overridden per instance)

#### 2.5 ModelBadge
- Fill: `$interactive-bg`, corner radius `$radius-badge`
- Padding: [2, 8]
- Child: text 11px, fill `$text-muted`

#### 2.6 TextInput
- Fill: `#00000033`, stroke: `$border-subtle`
- Corner radius 12, padding [10, 14]
- Child: text 14px, fill `$text-disabled` (placeholder)

#### 2.7 SearchBar
- Layout: horizontal, gap 8, alignItems center
- Fill: `$interactive-bg`, corner radius 10, padding [6, 12]
- Children: Search icon_font 16x16 (`$text-muted`) + text 14px (`$text-muted`)

### Chat Components

#### 2.8 UserMessage
- Align self to right (parent handles alignment)
- Fill: `$interactive-bg`, corner radius 24
- Padding: [14, 20]
- Child: text 14px, fill `$text-secondary`

#### 2.9 AssistantMessage
- No background, padding [0, 4]
- Child: text 14px, fill `$text-tertiary`, textGrowth fixed-width
- Streaming variant: add pulsing cursor rectangle at end

#### 2.10 ChatInput
- Container: corner radius `$radius-input`, fill `$bg-input` at 30% (`#9A6A4S4D`)
- Inner textarea area: fill transparent, padding [12, 20]
- Bottom toolbar: horizontal layout, gap 8, padding [8, 12]
  - Plus IconButton
  - ModelBadge instance (model name)
  - Spacer (fill_container)
  - "Review" GhostButton
  - Send IconButton (ArrowUp icon, circular, fill `$interactive-bg`)

### Composite Components

#### 2.11 SessionWindow (card mode)
- Width: 600, corner radius `$radius-card`
- Fill: `$bg-card` at 95% + backdrop_blur effect
- Stroke: `$border-default`, shadow effect
- Layout: vertical
- Children:
  - Header frame: height 48, horizontal, space_between, padding [0, 16]
    - Left: X IconButton (close)
    - Right: Clock IconButton + Plus IconButton
  - Messages area: vertical, gap 12, padding [16, 20], fill_container, clip
    - UserMessage / AssistantMessage instances
  - ChatInput instance

#### 2.12 TopBar
- Height: 56, width: fill_container
- Fill: `#00000033`, backdrop_blur, stroke bottom `$border-default`
- Layout: horizontal, space_between, alignItems center, padding [0, 16]
- Left group (horizontal, gap 12):
  - "AI Studio" text: 18px bold, gradient fill (orange→rose)
  - Project switcher: GhostButton with ChevronDown icon
  - View mode toggle: 3-button pill group in a frame with fill `$interactive-bg`, corner radius 8
    - Each button: icon + text, active state fill `$interactive-hover`
- Right group (horizontal, gap 12):
  - SearchBar instance
  - "New Session" PrimaryButton with Plus icon

#### 2.13 BoardCard
- Fill: `#FFFFFF0D`, stroke top 2px (status-colored), rest `$border-subtle`
- Corner radius 16, padding 16
- Layout: vertical, gap 12
- Children:
  - Title: text 14px semibold, fill `$text-primary`
  - Preview: text 13px, fill `$text-muted`, line clamp 2
  - Footer: horizontal, space_between
    - ModelBadge instance
    - Message count: MessageSquare icon + count text

#### 2.14 ZoomControls
- Layout: horizontal, gap 4, alignItems center
- Fill: `#00000066`, backdrop_blur, corner radius 12, padding 8
- Children: ZoomIn IconButton + "100%" text + ZoomOut IconButton + divider line + Maximize IconButton

#### 2.15 ModalBackdrop
- Full screen frame, fill `#00000099`, backdrop_blur effect
- Layout: none (children absolutely positioned to center)

#### 2.16 BroadcastPanel
- Width: 600, corner radius `$radius-card`
- Fill: `$bg-surface` at 95%, backdrop_blur, stroke `$border-default`
- Layout: vertical, gap 12, padding 20
- Children:
  - Selection info: text "2 sessions selected" with blue accent
  - Textarea: fill transparent, border `$border-subtle`
  - Send button row: horizontal, justify end

---

## 3. Full Pages (8 screens)

### 3.1 Canvas View — Main (1440x900)
- Background: `$bg-primary` with unsplash-style image fill at 40% opacity
- TopBar instance at top
- Canvas area (fill_container):
  - 3-4 SessionWindow instances at varied positions (absolute layout)
  - One focused: ring-4 `$accent-blue` at 50%, elevated shadow
- Tool buttons (top-left): vertical frame, 2 IconButtons (Hand, MousePointer2)
  - Active tool: fill `$accent-blue` at 50%
- ZoomControls instance (bottom-right)

### 3.2 Canvas View — Multi-Select (1440x900)
- Same as 3.1 but:
  - 2-3 SessionWindows with ring-2 `$accent-blue` (selected state)
  - Blue translucent selection rectangle overlay (`#3B82F633`)
  - BroadcastPanel at bottom center

### 3.3 Board View (1600x960)
- TopBar instance at top
- Board content (horizontal layout, gap 20, padding 32):
  - 4 column frames, each width 320:
    - Column header: horizontal, gap 8
      - Circle icon (filled with status color) + title text + count badge
    - Card list: vertical, gap 12
      - 2-3 BoardCard instances per column
- Right sidebar overlay: SessionWindow in fullscreen mode, width 500
  - Slide-in from right, shadow
- ZoomControls (bottom-left)

### 3.4 Tab View (1440x900)
- TopBar instance at top
- Body: horizontal layout, fill_container
  - Left sidebar (width 320):
    - Fill: `$bg-sidebar` at 80%
    - SearchBar at top, padding 12
    - Session list: vertical, gap 2
      - Each item: vertical, padding [10, 16]
        - Title + StatusBadge (horizontal)
        - Git info: GitBranch icon + branch text + FolderGit2 icon + worktree text (small, muted)
        - Active item: fill `$accent-blue` at 20%, stroke `$accent-blue` at 30%
  - Right content (fill_container):
    - Fill: `$bg-content`
    - SessionWindow in fullscreen mode (fills container)

### 3.5 Tab View — Empty State (1440x900)
- Same sidebar as 3.4
- Right content: centered vertically/horizontally
  - MessageSquare icon (48x48, `$text-disabled`)
  - "Select a session to get started" text, `$text-muted`

### 3.6 NewSessionModal (1440x900)
- Background: dimmed Canvas View screenshot or plain `$bg-primary`
- ModalBackdrop overlay
- Centered modal (width 512, corner radius `$radius-modal`):
  - Fill: `$bg-surface` at 95%, backdrop_blur, stroke `$border-default`
  - Padding: 24, gap 20, vertical layout
  - Header: "New Session" text 18px semibold + X IconButton (space_between)
  - "SELECT AGENT" label: 12px, `$text-muted`, letter-spacing 1, uppercase
  - Model cards row (horizontal, gap 12):
    - 3 cards, each fill_container width
    - Selected: fill `$interactive-bg`, stroke `$border-focus`, text-primary
    - Unselected: fill `#00000033`, stroke `$border-subtle`, text-muted
    - Each card: vertical, center, padding 16, gap 8, icon + model name
  - Title TextInput ("Session title...")
  - Git fields: 2-column grid (Branch TextInput + Worktree TextInput)
  - Prompt TextInput (textarea, multi-line, height ~80)
  - Footer: horizontal, justify end, gap 12
    - "Cancel" GhostButton
    - "Create Session" PrimaryButton (disabled when title empty)

### 3.7 GitSidebar (1440x900)
- Background: dimmed view
- Backdrop overlay: `#00000066`, backdrop_blur-sm
- Right panel (width 450):
  - Fill: `$bg-sidebar` at 95%, backdrop_blur, stroke left `$border-default`
  - Slide-in animation (shown in "open" state)
  - Header: "SOURCE CONTROL" text (12px, uppercase, tracking-wider) + X IconButton
  - Commit section:
    - Textarea: height 112, fill `#00000066`, stroke `$border-default`, corner radius 12
    - Button row: horizontal, gap 8
      - "Commit" button: fill `#2563EBCC` (blue-600/80), Check icon
      - "Discard" button: fill `#EF444419` (red-500/10), Trash2 icon
  - Divider line
  - File list: vertical
    - Each file row: horizontal, space_between, padding [8, 16], hover `#FFFFFF0D`
      - FileText icon + filename text
      - Status badge:
        - M (Modified): fill `#F59E0B19`, text `#F59E0B`
        - A (Added): fill `#22C55E19`, text `#22C55E`
        - D (Deleted): fill `#EF444419`, text `#EF4444`

### 3.8 DiffModal (1440x900)
- Background: dimmed view
- ModalBackdrop overlay
- Centered modal (width 1024, max-height ~720, corner radius `$radius-modal`):
  - Fill: `$bg-surface` at 95%, backdrop_blur, stroke `$border-default`
  - Header: horizontal, space_between, padding [16, 24]
    - Filename text 16px semibold + StatusBadge (MODIFIED/ADDED/DELETED)
    - X IconButton
  - Divider
  - Diff content (scrollable, monospace, padding 0):
    - Each line: horizontal frame, full width
      - Line number: text 12px mono, `$text-disabled`, width 48, right-align
      - Content: text 12px mono
        - Added (+): fill `#86EFAC` (green-300), bg `#22C55E19` (green-500/10)
        - Deleted (-): fill `#FCA5A5` (red-300), bg `#EF444419` (red-500/10)
        - Context (@@): fill `#93C5FD` (blue-300), bg `#3B82F619` (blue-500/10)
        - Normal: fill `$text-muted`

---

## 4. Canvas Layout Plan

Screens arranged on the pencil canvas for easy navigation:

```
Row 1:  [Design System Components] (x: 0, y: 0, ~2000x800)

Row 2:  [Canvas View Main]        [Canvas Multi-Select]
        (x: 0, y: 1000)           (x: 1550, y: 1000)

Row 3:  [Board View]
        (x: 0, y: 2050)

Row 4:  [Tab View]                [Tab Empty State]
        (x: 0, y: 3150)           (x: 1550, y: 3150)

Row 5:  [NewSessionModal]  [GitSidebar]  [DiffModal]
        (x: 0, y: 4200)   (x: 1550, y: 4200)  (x: 3100, y: 4200)
```

Gap between screens: ~100-150px for breathing room.

---

## 5. Implementation Notes

- All icons use `icon_font` nodes with `iconFontFamily: "lucide"`
- Text colors always set via `fill` property, never `textColor`
- Use `fill_container` / `fit_content` for responsive sizing within flex layouts
- `textGrowth: "fixed-width"` + `width: "fill_container"` for paragraph/description text
- Backdrop blur effects approximated via `background_blur` effect type
- Semi-transparent fills use 8-digit hex RGBA (e.g., `#3A3D4AF2` for 95%)
- The background image on Canvas View can be generated via `G()` operation with "abstract gradient dark purple orange" prompt
