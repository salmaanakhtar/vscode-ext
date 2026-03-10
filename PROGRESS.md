# vscode-ext — Development Progress

## Last Updated
2026-03-10T19:05:00Z

## Current Phase
Phase 2 — Agent Runtime | Sub-phase 2.1 — Memory Adapters (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)

## Current Branch
main (phase/2.1-memory-adapters merged and deleted)

## What Was Just Built
`FileAdapter` (file-based memory using JSON files), `SQLiteAdapter` (SQLite with FTS5 full-text search), and `MemoryManager` (Result<T>-wrapped facade with `getAgentContext`/`getProjectContext` helpers). 30 unit tests across two test files, all passing. Both adapters fully implement the `MemoryAdapter` interface from `@vscode-ext/shared`.

## Decisions Made This Session
- Removed `rootDir: "src"` from `packages/core/tsconfig.json` — the `paths` alias resolves `@vscode-ext/shared` to `../shared/src` which is outside `src/`, causing TS6059. Without `rootDir`, TypeScript infers the common ancestor. Build step can use a separate `tsconfig.build.json` if needed later.
- Added `resolve.alias` to `packages/core/vitest.config.ts` — Vitest (Vite) doesn't read TypeScript `paths`, so the alias must be declared explicitly for tests to resolve `@vscode-ext/shared`.
- `SQLiteAdapter` uses `any` for the `db` field and `BetterSqlite3` constructor — `better-sqlite3` v9 bundled types aren't resolved via npm workspace hoisting; dynamic `require()` with `any` avoids the hard type dependency, which is appropriate since SQLiteAdapter is an optional backend.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- `packages/core/tsconfig.json` has no `rootDir` — acceptable for now, but a `tsconfig.build.json` with proper project references should be added when the build step is implemented.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-2.2.md`.
3. Create branch: `git checkout main && git pull origin main && git checkout -b phase/2.2-team-registry`
4. Implement `TeamRegistry` in `packages/core/src/registry/`.
5. Write unit tests with >80% coverage.
6. Run `npm run typecheck && npm run lint && npm run test` — all must pass before pushing.

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
│   └── (all PHASE-*.md files)
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/index.ts
│   │       ├── interfaces/MemoryAdapter.ts
│   │       ├── constants/index.ts
│   │       ├── utils/paths.ts
│   │       ├── utils/id.ts
│   │       ├── utils/logger.ts
│   │       ├── utils/validation.ts
│   │       └── __tests__/
│   │           ├── id.test.ts
│   │           ├── paths.test.ts
│   │           └── validation.test.ts
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── memory/
│   │       │   ├── FileAdapter.ts
│   │       │   ├── SQLiteAdapter.ts
│   │       │   ├── MemoryManager.ts
│   │       │   └── index.ts
│   │       ├── __tests__/
│   │       │   └── memory/
│   │       │       ├── FileAdapter.test.ts
│   │       │       └── MemoryManager.test.ts
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
│       ├── resources/icon.svg
│       └── src/
│           ├── extension.ts
│           ├── panels/.gitkeep
│           ├── providers/.gitkeep
│           ├── commands/.gitkeep
│           └── statusbar/.gitkeep
```
