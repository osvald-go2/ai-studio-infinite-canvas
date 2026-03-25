# AI Studio Infinite Canvas

A React application for managing multiple AI sessions (Claude, Codex, Gemini) concurrently on an infinite canvas.

## Features

- **Infinite Canvas** — Drag, pan, zoom, multi-select sessions, and broadcast messages to selected sessions
- **Kanban Board** — Organize sessions by status (inbox → in process → review → done)
- **Tab View** — Tab-based navigation with search
- **Multi-AI Support** — Google Gemini, Claude, and Codex integration
- **Electron Desktop App** — Native desktop experience with Rust backend
- **Git Integration** — Built-in diff viewer for AI-generated code changes

## Prerequisites

- Node.js
- (Optional) Rust — required for the `ai-backend` module

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set your Gemini API key:
   ```bash
   cp .env.example .env.local
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Vite, port 3000) |
| `npm run build` | Production build |
| `npm run lint` | TypeScript type checking |
| `npm run dev:electron` | Start Electron dev mode |
| `npm run dist` | Build Electron + package macOS DMG |

## Tech Stack

React 19 / TypeScript / Vite 6 / Tailwind CSS 4 / Electron / Rust

## License

[MIT](LICENSE)
