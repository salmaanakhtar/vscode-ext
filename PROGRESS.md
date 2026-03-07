# vscode-ext — Development Progress

## Last Updated
2026-03-07T00:00:00Z

## Current Phase
Phase 1 — Foundation | Sub-phase 1.1 — Monorepo Scaffold (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold

## Current Branch
main (phase/1.1-monorepo-scaffold merged and deleted)

## What Was Just Built
Full monorepo skeleton with npm workspaces for three packages: `@vscode-ext/shared`, `@vscode-ext/core`, and `vscode-ext` (extension). All config files (tsconfig, eslint, gitignore, .env.example) are in place. TypeScript compiles and lint passes with zero errors across all packages. Corrected to match updated CLAUDE.md: removed SDK dep from core, renamed directories to match canonical structure, updated .env.example.

## Decisions Made This Session
- ESLint lint script uses quoted globs with `--no-error-on-unmatched-pattern` for Windows compatibility.
- Added `argsIgnorePattern: '^_'` to `no-unused-vars` rule to allow `_context` stub parameter in extension entry point.
- `core/src/` uses `messaging/` and `approval/` (CLAUDE.md canonical names), not `bus/` and `gate/`.
- No `@anthropic-ai/claude-code` SDK in core — agent runtime uses Claude Code CLI subprocess (`claude --print`).
- No `ANTHROPIC_API_KEY` needed — authentication is via the user's local `claude` CLI installation.

## Known Issues / TODOs
- Node.js v18 is below some transitive dependency requirements (e.g. `@azure/identity` requires v20). Engine warnings only, not blockers.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-1.2.md`.
3. Create branch: `git checkout main && git pull origin main && git checkout -b phase/1.2-shared-types`
4. Implement all TypeScript types/interfaces from CLAUDE.md canonical types section into `packages/shared/src/types/`.
5. Export everything from `packages/shared/src/index.ts`.
6. Write unit tests (vitest) in `packages/shared/src/__tests__/`.
7. Run `npm run typecheck && npm run lint && npm run test` — all must pass before pushing.

## File Tree Snapshot
```
vsdcode-ext/
├── .env.example
├── .eslintrc.js
├── .gitignore
├── CLAUDE.md
├── PROGRESS.md
├── package.json
├── tsconfig.base.json
├── _phases/
│   ├── PHASE-1.md
│   ├── PHASE-1.1.md
│   ├── PHASE-1.2.md
│   ├── PHASE-2.md
│   ├── PHASE-2.1.md
│   ├── PHASE-2.2.md
│   ├── PHASE-3.md
│   ├── PHASE-3.1.md
│   ├── PHASE-3.2.md
│   ├── PHASE-4.md
│   ├── PHASE-4.1.md
│   ├── PHASE-4.2.md
│   ├── PHASE-5.md
│   ├── PHASE-5.1.md
│   ├── PHASE-5.2.md
│   ├── PHASE-6.md
│   ├── PHASE-6.1.md
│   ├── PHASE-7.md
│   └── PHASE-7.1.md
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/.gitkeep
│   │       ├── interfaces/.gitkeep
│   │       └── constants/.gitkeep
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── memory/.gitkeep
│   │       ├── registry/.gitkeep
│   │       ├── runtime/.gitkeep
│   │       ├── messaging/.gitkeep
│   │       ├── approval/.gitkeep
│   │       ├── orchestrator/.gitkeep
│   │       ├── git/.gitkeep
│   │       └── templates/.gitkeep
│   └── extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── resources/
│       │   └── icon.svg
│       └── src/
│           ├── extension.ts
│           ├── panels/.gitkeep
│           ├── providers/.gitkeep
│           ├── commands/.gitkeep
│           └── statusbar/.gitkeep
```
