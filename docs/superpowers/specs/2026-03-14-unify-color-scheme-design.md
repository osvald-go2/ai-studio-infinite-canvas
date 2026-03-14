# Unify UI Color Scheme

**Date:** 2026-03-14
**Status:** Approved
**Approach:** Direct replacement of hardcoded color values (Option A)

## Problem

The project has two conflicting background color families:
- **Warm brown** (`#2A2421`, `#1A1512`, `#14100E`) — used by NewSessionModal, DiffModal, GitSidebar, TabView
- **Cool gray-blue** (`#3A3D4A`, `#23252E`, `#1E2023`) — used by SessionWindow, BoardView sidebar, code blocks (including CodeBlock.tsx)

This creates visual inconsistency, especially when NewSessionModal (brown) appears over the canvas alongside SessionWindow (gray-blue).

## Target Color Palette

Derived from a Claude.ai-style reference: neutral cool gray with warm amber input accent.

| Token | Hex | Usage |
|-------|-----|-------|
| Base | `#1A1A2E` | App root background, deepest layer |
| Deep | `#2B2D3A` | Code blocks, sidebar backgrounds, secondary surfaces |
| Card | `#3B3F4F` | All cards, modals, containers, session windows |
| Input accent | `#A07841` at 30% opacity | Input field backgrounds (warm amber) |

Supporting colors (unchanged):
- Borders: `rgba(255,255,255,0.08)` to `rgba(255,255,255,0.1)`
- Hover: `bg-white/5`, `bg-white/10`
- Focus: `bg-white/15`, `bg-white/20`
- Text: `#ffffff` (primary), `#9ca3af` (secondary)
- Functional: blue/green/amber/red status colors unchanged
- Brand: orange→rose gradient unchanged

## Replacement Map

### App.tsx
| Old | New |
|-----|-----|
| `bg-neutral-900` | `bg-[#1A1A2E]` |

### NewSessionModal.tsx
| Old | New |
|-----|-----|
| `bg-[#2A2421]/95` | `bg-[#3B3F4F]/95` |

### SessionWindow.tsx
| Old | New |
|-----|-----|
| `bg-[#3A3D4A]/95` | `bg-[#3B3F4F]/95` |
| `bg-[#9A6A45]/30` | `bg-[#A07841]/30` |
| `bg-[#23252E]` | `bg-[#2B2D3A]` |

### DiffModal.tsx
| Old | New |
|-----|-----|
| `bg-[#2A2421]/95` | `bg-[#3B3F4F]/95` |

### GitSidebar.tsx
| Old | New |
|-----|-----|
| `bg-[#1A1512]/95` | `bg-[#2B2D3A]/95` |

### CodeBlock.tsx
| Old | New |
|-----|-----|
| `bg-[#1E2023]/80` | `bg-[#2B2D3A]/80` |

### TopBar.tsx
| Old | New |
|-----|-----|
| `bg-[#2A2421]/95` (all dropdown instances — project-switcher and search-results) | `bg-[#3B3F4F]/95` |

### TabView.tsx
| Old | New |
|-----|-----|
| `bg-[#1A1512]/80` (left sidebar) | `bg-[#2B2D3A]/80` |
| `bg-[#14100E]` (right panel) | `bg-[#1A1A2E]` |

### BoardView.tsx
| Old | New |
|-----|-----|
| `bg-[#3A3D4A]/95` (sidebar) | `bg-[#3B3F4F]/95` |

### CanvasView.tsx
| Old | New |
|-----|-----|
| `bg-[#2A2421]/95` (broadcast input) | `bg-[#3B3F4F]/95` |

## Unchanged Elements

- Border transparency (`border-white/10`, `border-white/20`)
- Hover/focus state overlays (`bg-white/5` through `bg-white/20`)
- Text color system (white/gray hierarchy)
- Functional status colors (blue, green, amber, red)
- Brand gradient (orange-400 → rose-400)
- Canvas background (`canvas-bg` CSS class)
- Scrollbar styles in `index.css`

## Scope

- **In scope:** Background color replacements listed above
- **Out of scope:** CSS variable system, Tailwind theme extension, canvas background image, functional/status colors, text colors, border styles

## Testing

- Visual inspection across all three view modes (Canvas, Board, Tab)
- Verify NewSessionModal matches SessionWindow color tone
- Verify DiffModal matches the unified palette
- Verify GitSidebar blends with the new scheme
- Check hover/focus states still provide sufficient contrast
