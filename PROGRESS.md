# vscode-ext — Development Progress

## Last Updated
2026-03-22T09:36:00Z

## Current Phase
Phase 2 — Agent Runtime | Sub-phase 2.2 — TeamRegistry (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry

## Current Branch
main (phase/2.2-team-registry merged and deleted)

## What Was Just Built
`TeamRegistry` in `packages/core/src/registry/`. Manages the full `.agent/` directory lifecycle: `initProject` creates all dirs and seed files, `load`/`save` round-trip `team.json` with validation, `registerAgent` creates agent dirs/CLAUDE.md/tools.json/inbox and appends to config, `removeAgent` and `updateAgent` mutate and persist, plus file-reader helpers. 32 unit tests across all happy paths and error cases, all passing.

## Decisions Made This Session
- Used `getAgentWorkDir` (the actual export name) instead of the spec's `getAgentDir2` — the spec had a stale import name that didn't match the implemented paths utility.
- Test `makeAgent` fixture uses `maxTurns: 20` not `maxBudgetUsd` — spec had an outdated field name from before the subscription-mode refactor.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- `packages/core/tsconfig.json` has no `rootDir` — acceptable for now.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-3.1.md` (Agent Runtime).
3. Create branch: `git checkout main && git checkout -b phase/3.1-agent-runtime`
4. Implement `AgentRuntime` in `packages/core/src/runtime/`.
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
│   │       ├── registry/
│   │       │   ├── TeamRegistry.ts
│   │       │   └── index.ts
│   │       ├── __tests__/
│   │       │   ├── memory/
│   │       │   │   ├── FileAdapter.test.ts
│   │       │   │   └── MemoryManager.test.ts
│   │       │   └── registry/
│   │       │       └── TeamRegistry.test.ts
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
