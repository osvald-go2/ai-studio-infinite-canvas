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
| `bg-card` | `#3A3D4A` | SessionWindow card (always used at 95% → `#3A3D4AF2`) |
| `bg-sidebar` | `#1A1512` | TabView sidebar |
| `bg-content` | `#14100E` | TabView content area |
| `bg-input` | `#9A6A45` | Chat input tint (used at 30% opacity → `#9A6A454D`) |

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

### Status Colors — Board View

Used in BoardView columns and cards.

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

### Status Colors — Tab View

Different color mapping used in TabView sidebar badges.

| Variable | Value | Usage |
|---|---|---|
| `tab-status-inbox` | `#60A5FA` | blue-400 |
| `tab-status-inprocess` | `#FBBF24` | amber-400 |
| `tab-status-review` | `#A78BFA` | purple-400 |
| `tab-status-done` | `#34D399` | emerald-400 |
| `tab-status-inbox-bg` | `#3B82F633` | blue-500/20 |
| `tab-status-inprocess-bg` | `#F59E0B33` | amber-500/20 |
| `tab-status-review-bg` | `#8B5CF633` | purple-500/20 |
| `tab-status-done-bg` | `#10B98133` | emerald-500/20 |

### Interactive / Accent

| Variable | Value | Source |
|---|---|---|
| `interactive-bg` | `#FFFFFF1A` | `white/10` |
| `interactive-bg-subtle` | `#FFFFFF0D` | `white/5` |
| `interactive-hover` | `#FFFFFF33` | `white/20` |
| `interactive-hover-subtle` | `#FFFFFF26` | `white/15` |
| `accent-blue` | `#3B82F6` | Selection / active |
| `accent-blue-light` | `#60A5FA` | blue-400 (review button) |
| `accent-orange` | `#FB923C` | Brand gradient start (orange-400) |
| `accent-rose` | `#FB7185` | Brand gradient end (rose-400) |
| `accent-red` | `#EF4444` | Destructive (red-500) |
| `accent-blue-600` | `#2563EB` | Commit button (blue-600) |

### Git File Status Colors

| Variable | Value | Usage |
|---|---|---|
| `git-modified` | `#EAB308` | yellow-500 |
| `git-modified-bg` | `#EAB30819` | yellow-500/10 |
| `git-added` | `#22C55E` | green-500 |
| `git-added-bg` | `#22C55E19` | green-500/10 |
| `git-deleted` | `#EF4444` | red-500 |
| `git-deleted-bg` | `#EF444419` | red-500/10 |

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
- Size: 32x32, corner radius 100 (fully round, `rounded-full`)
- Fill: transparent (hover: `$interactive-bg`)
- Child: lucide icon_font 16x16, fill `$text-muted`
- Layout: horizontal, center/center

#### 2.2 GhostButton
- Fill: `$interactive-bg` (hover: `$interactive-hover`)
- Padding: [8, 16], corner radius `$radius-button`
- Child: text 14px, fill `$text-primary`
- Layout: horizontal, center/center, gap 8

#### 2.3 StatusBadge — Board Variant
- Fill: `$status-inbox-bg` (default, overridden per instance)
- Padding: [2, 8], corner radius `$radius-badge`
- Child: text 11px uppercase, fill `$status-inbox` (overridden per instance)

#### 2.4 StatusBadge — Tab Variant
- Fill: `$tab-status-inbox-bg` (default, overridden per instance)
- Padding: [2, 8], corner radius `$radius-badge`
- Child: text 10px uppercase, fill `$tab-status-inbox` (overridden per instance)

#### 2.5 ModelBadge
- Fill: `$interactive-bg`, corner radius `$radius-badge`
- Padding: [2, 8]
- Child: text 11px, fill `$text-muted`

#### 2.6 TextInput
- Fill: `#00000033`, stroke: `$border-subtle`
- Corner radius 12, padding [10, 14]
- Child: text 14px, fill `$text-disabled` (placeholder)

#### 2.7 SearchInput
- Layout: horizontal, gap 8, alignItems center
- Fill: `$interactive-bg-subtle` (`white/5`), stroke `$border-default`, corner radius 8 (`rounded-lg`)
- Focus state: stroke `$border-focus`, ring `$border-focus`
- Children: Search icon_font 16x16 (`$text-muted`) + text 14px (`$text-muted`)

### Chat Components

#### 2.8 UserMessage
- Align self to right (parent handles alignment via `alignItems: end`)
- Fill: `$interactive-bg`, corner radius 24
- Padding: [14, 20]
- Child: text 14px, fill `$text-secondary`

#### 2.9 AssistantMessage
- No background, padding [0, 4]
- Child: text 14px, fill `$text-tertiary`, textGrowth fixed-width
- Streaming variant: append a pulsing cursor rectangle (2x16, fill `$text-muted`)

#### 2.10 ChatInput
- Container: corner radius `$radius-input`, fill `$bg-input` at 30% (`#9A6A454D`)
- Inner textarea area: fill transparent, padding [12, 16]
- Bottom toolbar: horizontal layout, gap 8 (`gap-2`), padding [4, 8] (`pb-1 px-2`)
  - Plus IconButton
  - ModelBadge instance (model name)
  - Spacer (fill_container)
  - Review button (conditional): fill `#3B82F619` (blue-500/10), text `$accent-blue-light`, shows "+N -N Review"
  - Send IconButton (ArrowUp icon, circular 32x32, fill `$interactive-bg`)
  - Stop button (streaming state): circular 32x32, fill `#EF444433` (red-500/20), Square icon fill `#FCA5A5` (red-400)

### Composite Components

#### 2.11 SessionWindow (card mode)
- Width: 600, corner radius `$radius-card`
- Fill: `$bg-card` at 95% (`#3A3D4AF2`) + background_blur effect (24px)
- Stroke: `$border-default`, shadow effect (0 8 24 `#00000066`)
- Layout: vertical
- Children:
  - Header frame: padding [16, 24] (p-4 px-6), horizontal, space_between, cursor-move
    - Left: X IconButton (close, round, fill `$interactive-bg-subtle` at rest, hover `$interactive-bg`)
    - Right: bare icon buttons (no background, just icon with hover:text-gray-200) — Clock (18px) + Plus (18px)
  - Messages area: vertical, gap 24 (`space-y-6`), padding [8, 24, 24, 24] (`p-6 pt-2`), fill_container, clip
    - UserMessage / AssistantMessage instances
  - ChatInput instance

#### 2.12 TopBar
- Height: 56 (`h-14`), width: fill_container
- Fill: `#00000033` (black/20), background_blur, stroke bottom `$border-default`
- Layout: horizontal, space_between, alignItems center, padding [0, 24] (`px-6`)
- Left group (horizontal, gap 16 (`gap-4`), alignItems center):
  - "AI Studio" text: 18px bold, linear gradient fill (orange-400 → rose-400)
  - Project switcher: transparent button (no fill at rest), hover `$interactive-bg`, with abbreviated project badge + ChevronDown icon, text 14px medium `$text-secondary`
  - View mode toggle: 3-button pill in a frame with fill `$interactive-bg-subtle` (`white/5`), corner radius 8
    - Each button: icon + text (14px, `text-sm`), padding [6, 12]
    - Active button: fill `$interactive-hover-subtle` (`white/15`), text `$text-primary`
    - Inactive button: fill transparent, text `$text-muted`
- Right group (horizontal, gap 16 (`gap-4`), alignItems center):
  - SearchInput instance (width ~200)
  - "New Session" GhostButton: fill `$interactive-bg` (`white/10`), hover `$interactive-hover` (`white/20`), text `$text-primary`, Plus icon

#### 2.13 BoardCard
- Fill: `#FFFFFF0D`, stroke top 2px (status-colored), rest `$border-subtle`
- Corner radius 16 (`rounded-2xl`), padding 16
- Layout: vertical, gap 12
- Children:
  - Title: text 14px semibold, fill `$text-primary`
  - Preview: text 13px, fill `$text-muted`, textGrowth fixed-width, width fill_container (line clamp 2 via height constraint)
  - Footer: horizontal, space_between
    - ModelBadge instance
    - Message count: MessageSquare icon (12x12) + count text (12px, `$text-disabled`)

#### 2.14 ZoomControls
- Layout: horizontal, gap 4, alignItems center
- Fill: `#00000066` (black/40), background_blur, corner radius 12, padding 8
- Children: ZoomIn IconButton + "100%" text (12px, `$text-muted`) + ZoomOut IconButton + divider line (1px wide, 16px tall, `$border-default`) + Maximize IconButton

#### 2.15 ModalBackdrop
- Full screen frame, fill `#00000099` (black/60), background_blur effect
- Layout: none (children absolutely positioned to center)

#### 2.16 BroadcastPanel
- Width: 600, corner radius 16 (`rounded-2xl`)
- Fill: `$bg-surface` at 95% (`#2A2421F2`), background_blur, stroke `$border-focus` (`white/20`)
- Layout: vertical, gap 12, padding 16 (`p-4`)
- Children:
  - Header row: horizontal, space_between, alignItems center
    - Left: single text span "Broadcasting to N sessions", fill `$accent-blue-light` (blue-400) — entire text is one color
    - Right: "Cancel" text button (no background, 12px, `$text-muted`, hover `$text-primary`)
  - Textarea: fill `#00000033` (black/20), stroke `$border-default` (white/10), corner radius 12, padding [10, 14]
  - Send button: positioned at bottom-right of textarea (absolute), square, fill `$accent-blue-600` (blue-600), corner radius 8 (`rounded-lg`), padding 8, Send icon white

---

## 3. Full Pages (10 screens)

### 3.1 Canvas View — Main (1440x900)
- Background: `$bg-primary` with AI-generated abstract image fill at 40% opacity
- TopBar instance at top
- Canvas area (fill_container, layout none):
  - 3-4 SessionWindow instances at varied positions (absolute layout)
  - One focused: stroke 4px `$accent-blue` at 50%, elevated shadow (0 8 32 `#3B82F633`)
- Tool buttons (top-left): vertical frame, gap 4, fill `#00000066`, corner radius 12, padding 4
  - 2 IconButtons: Hand, MousePointer2
  - Active tool: fill `$accent-blue` at 50%, text `$text-primary`
  - Inactive: fill transparent, text `$text-muted`
- ZoomControls instance (bottom-right)

### 3.2 Canvas View — Multi-Select (1440x900)
- Same as 3.1 but:
  - 2-3 SessionWindows with stroke 2px `$accent-blue` (selected state)
  - Blue translucent selection rectangle overlay (`#3B82F633`, stroke `#60A5FA`)
  - BroadcastPanel at bottom center

### 3.3 Board View (1600x960)
- TopBar instance at top
- Board content (horizontal layout, gap 24 (`gap-6`), padding 32 (`p-8`)):
  - 4 column frames, each width 320 (`w-80`):
    - Column header: horizontal, gap 8, alignItems center
      - Circle icon (8x8, filled with status color) + title text (14px semibold) + count badge (filled pill, `$interactive-bg`)
    - Card list: vertical, gap 12, clip, scrollable
      - 2-3 BoardCard instances per column
- Right sidebar overlay: SessionWindow in fullscreen mode, width 500 (`w-[500px]`)
  - Slide-in from right, shadow
- ZoomControls (bottom-left)

### 3.4 Tab View (1440x900)
- TopBar instance at top
- Body: horizontal layout, fill_container
  - Left sidebar (width 320, `w-80`):
    - Fill: `$bg-sidebar` at 80% (`#1A1512CC`)
    - SearchInput at top, padding 12
    - Session list: vertical, gap 2
      - Each item: vertical, padding [10, 16]
        - Row 1: Title (14px, `$text-primary`) + StatusBadge (Tab variant)
        - Row 2: GitBranch icon (12x12) + branch text + FolderGit2 icon (12x12) + worktree text (12px, `$text-disabled`)
        - Active item: fill `$accent-blue` at 20% (`#3B82F633`), stroke `$accent-blue` at 30%
        - Inactive hover: fill `$interactive-bg-subtle`
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
  - Fill: `$bg-surface` at 95% (`#2A2421F2`), background_blur, stroke `$border-default`
  - Padding: 24, gap 20, vertical layout
  - Header: "New Session" text 18px semibold + X IconButton round (space_between)
  - Title TextInput ("Session title...") — **comes first**
  - "Model" label: 14px medium (`font-medium`), fill `$text-tertiary` (gray-300)
  - Model cards row (horizontal, gap 12):
    - 3 cards, each fill_container width
    - Selected: fill `$interactive-bg`, stroke `$border-focus`, text `$text-primary`, shadow-inner
    - Unselected: fill `#00000033`, stroke `$border-subtle`, text `$text-muted`, hover `$interactive-bg-subtle`
    - Each card: vertical, center, padding 16, gap 8, SVG icon + model name text
  - Git fields: 2-column grid (Branch TextInput + Worktree TextInput), each with GitBranch/FolderGit2 icon
  - Prompt TextInput (textarea, multi-line, height ~80)
  - Footer: horizontal, justify end, gap 12
    - "Cancel" GhostButton
    - "Create Session" GhostButton: fill `$interactive-bg`, stroke `$border-subtle`, disabled style when title empty

### 3.7 GitSidebar (1440x900)
- Background: dimmed view
- Backdrop overlay: `#00000066` (black/40), background_blur-sm
- Right panel (width 450):
  - Fill: `$bg-sidebar` at 95% (`#1A1512F2`), background_blur, stroke left `$border-default`
  - Slide-in animation (shown in "open" state)
  - Header: "SOURCE CONTROL" text (12px, uppercase, tracking-wider, `$text-muted`) + X IconButton round
  - Commit section (when diff exists):
    - Textarea: height 112 (`h-28`), fill `#00000066`, stroke `$border-default`, corner radius 12
    - Button row: horizontal, gap 8
      - "Commit" button: fill `$accent-blue-600` at 80% (`#2563EBCC`), Check icon, text white
      - "Discard" button: fill `$git-deleted-bg`, Trash2 icon, text `$accent-red`
  - "Changes" section header: horizontal, space_between
    - "Changes" label (12px, uppercase, `$text-muted`)
    - Count badge: pill, fill `$interactive-bg`, text `$text-tertiary`, corner radius 100
  - File list: vertical
    - Each file row: horizontal, space_between, padding [8, 16], hover `$interactive-bg-subtle`
      - FileText icon (14x14, `$text-muted`) + filename text (13px, `$text-secondary`)
      - Status badge: corner radius 4, padding [1, 6], stroke at 20% of status color
        - M (Modified): fill `$git-modified-bg`, text `$git-modified`, stroke `#EAB30833`
        - A (Added): fill `$git-added-bg`, text `$git-added`, stroke `#22C55E33`
        - D (Deleted): fill `$git-deleted-bg`, text `$git-deleted`, stroke `#EF444433`
  - Empty state (no diff): centered text "No active changes" (`$text-disabled`)

### 3.8 DiffModal (1440x900)
- Background: dimmed view
- ModalBackdrop overlay
- Centered modal (width 1024, max-height ~720, corner radius `$radius-modal`):
  - Fill: `$bg-surface` at 95% (`#2A2421F2`), background_blur, stroke `$border-default`
  - Header: horizontal, space_between, padding [16, 24]
    - Filename text 16px semibold (`$text-primary`) + StatusBadge (MODIFIED/ADDED/DELETED)
    - X IconButton round
  - Divider: height 1, fill `$border-default`
  - Diff content (scrollable, monospace `font-mono`, text-xs 12px):
    - Each line: horizontal frame, full width, padding [4, 24] (`py-1 px-6`)
      - Content: text 12px mono
        - Added (+): fill `#86EFAC` (green-300), bg `#22C55E19` (green-500/10)
        - Deleted (-): fill `#FCA5A5` (red-300), bg `#EF444419` (red-500/10)
        - Context header (@@): fill `#93C5FD` (blue-300), bg `#3B82F619` (blue-500/10)
        - Normal: fill `$text-muted`
    - No line numbers (source does not render them)

### 3.9 Project Switcher Dropdown
- Standalone dropdown component (width ~280), not a full page
- Anchored below the project switcher button in TopBar
- Fill: `$bg-surface`, stroke `$border-default`, corner radius 12, shadow
- Layout: vertical
- Children:
  - Project list: vertical
    - Each item: horizontal, gap 10, padding [8, 12], hover `$interactive-bg-subtle`
      - Project icon badge: 32x32 (`w-8 h-8`), rounded 8 (`rounded-lg`), colored background with 2-letter abbreviation
      - Project info: vertical
        - Name: 13px semibold, `$text-primary`
        - Path: 11px, `$text-disabled`
      - Checkmark icon (only on selected project): 16x16, `#34D399` (emerald-400)
  - Divider
  - "Open Folder..." option: horizontal, gap 8, padding [8, 12]
    - FolderOpen icon + text 13px, `$text-muted`

### 3.10 Search Results Dropdown
- Standalone dropdown component (width ~320), not a full page
- Anchored below the search input in TopBar
- Fill: `$bg-surface`, stroke `$border-default`, corner radius 12, shadow
- Layout: vertical, padding 4
- Children:
  - Session result items: vertical
    - Each item: vertical, padding [8, 12], corner radius 8, hover `$interactive-bg-subtle`
      - Title: 13px semibold, `$text-primary`
      - Last message preview: 12px, `$text-disabled`, single line truncated

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

Row 6:  [Project Switcher DD]  [Search Results DD]
        (x: 0, y: 5200)       (x: 500, y: 5200)
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
- IconButtons are fully round (`cornerRadius: 100`) matching source `rounded-full`
- SessionWindow card mode uses `#3A3D4AF2` (95% opacity of bg-card), never the raw token
- "New Session" button and "Create Session" button both use GhostButton style (`white/10`), NOT blue primary
- The ChatInput "Review" button only appears conditionally and uses a blue-tinted variant
- During streaming, the send button is replaced with a red stop button (Square icon)
- Session '1' in the demo data renders rich mock content including tool call UI (glob, read, bash, write), code blocks with syntax highlighting, and suggestion chips (Copy, ThumbsUp, ThumbsDown). For maximum fidelity, one SessionWindow instance should show this complex content.
