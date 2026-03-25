# Open Source Preparation Design

## Context

AI Studio Infinite Canvas is a React SPA for managing multiple AI sessions on an infinite canvas. The project is currently private and needs preparation before being published as an open-source repository on GitHub under `osvald-go2/ai-studio-infinite-canvas`.

## Decisions

- **License:** MIT (2026, osvald-go2)
- **Scope:** Minimal changes — only what's legally and practically required for open source
- **No** CONTRIBUTING.md, CODE_OF_CONDUCT.md, or CI/CD configuration
- **GitHub account:** osvald-go2

## Changes

### 1. Add MIT LICENSE file

Create a standard MIT LICENSE file at project root.

- Copyright holder: osvald-go2
- Year: 2026

### 2. Update package.json

- Remove `"private": true`
- Add `"license": "MIT"`
- Add `"repository": "github:osvald-go2/ai-studio-infinite-canvas"`
- Add `"homepage": "https://github.com/osvald-go2/ai-studio-infinite-canvas"`
- Add `"bugs": "https://github.com/osvald-go2/ai-studio-infinite-canvas/issues"`
- Add `"keywords": ["ai", "infinite-canvas", "react", "electron", "gemini"]`

All other fields remain unchanged.

### 3. Rewrite README.md

Replace the current AI Studio internal README with a community-facing version:

- Project name and one-line description
- Features list (3 view modes, multi-AI support, broadcast messaging, Electron, Rust backend)
- Prerequisites (Node.js, optional Rust)
- Getting Started (install, env setup, dev server)
- Tech Stack summary
- License reference
- Remove AI Studio banner image and app ID link

### 4. Audit git history for sensitive information

Check historical commits for leaked API keys, credentials, or secrets. Report findings without rewriting history — let the user decide on cleanup approach.

## Out of Scope

- CONTRIBUTING.md / CODE_OF_CONDUCT.md
- GitHub Actions CI/CD
- CHANGELOG.md
- README badges or screenshots
- Git history rewriting
