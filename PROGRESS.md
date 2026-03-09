# vscode-ext — Development Progress

## Last Updated
2026-03-10T02:01:00Z

## Current Phase
Phase 1 — Foundation | Sub-phase 1.2 — Shared Types (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests

## Current Branch
main (phase/1.2-shared-types merged and deleted)

## What Was Just Built
All canonical TypeScript types and interfaces in `packages/shared/src/types/index.ts` (Agent, Task, ApprovalRequest, MemoryEntry, TeamConfig, etc.), `MemoryAdapter` interface in `packages/shared/src/interfaces/`, constants in `packages/shared/src/constants/`, and four utility modules (paths, id, logger, validation). 23 vitest unit tests across 3 test files, all passing. `packages/core/vitest.config.ts` added with `passWithNoTests: true` so the root test runner doesn't fail before core has tests.

## Decisions Made This Session
- `getAgentDir2` renamed to `getAgentWorkDir` to avoid the awkward numbered suffix.
- `packages/core/vitest.config.ts` added with `passWithNoTests: true` — will be updated when core tests are written in Phase 2.
- Phase 1.2 types are a superset of the CLAUDE.md canonical types (PHASE-1.2.md is the authoritative source for this phase).

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-2.1.md`.
3. Create branch: `git checkout main && git pull origin main && git checkout -b phase/2.1-memory-adapters`
4. Implement `FileMemoryAdapter` in `packages/core/src/memory/`.
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
│       ├── resources/icon.svg
│       └── src/
│           ├── extension.ts
│           ├── panels/.gitkeep
│           ├── providers/.gitkeep
│           ├── commands/.gitkeep
│           └── statusbar/.gitkeep
```
