# vscode-ext — Development Progress

## Last Updated
2026-03-28T20:00:00Z

## Current Phase
Phase 4 — Git Integration | Sub-phase 4.2 — Git Integration (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)
- [x] 3.2 — MessageBus & ApprovalGate
- [x] 4.1 — Orchestrator & TaskQueue
- [x] 4.2 — Git Integration (GitManager)

## Current Branch
main (phase/4.2-git-integration merged and deleted)

## What Was Just Built
`GitManager` in `packages/core/src/git/`. Provides per-agent git operations: `createBranch` (naming: `agent/[id]/[slug]`), `commit` (appends `[agent:id]` to message), `push`, `createPR` (via `gh` CLI), `merge`, `getStatus`, `listBranches`, `getCurrentBranch`, and a stub `getFileOwnership`. All operations enforce `GitPermissions` and return `Result<T>` — no throws. Moved `simple-git` from devDependencies to dependencies. 16 new unit tests; 179 total passing.

## Decisions Made This Session
- Spec test used `maxBudgetUsd` field (old name) — corrected to `maxTurns` per current shared types.
- Spec test used `/bin/bash` shell (Unix-only) — replaced with `getCurrentBranch()` call for Windows compatibility.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh installation); covered in later integration phase.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-5.1.md` (VS Code Extension Shell).
3. Create branch: `git checkout main && git checkout -b phase/5.1-vscode-shell`
4. Implement the VS Code extension shell in `packages/extension/src/`.
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
│   │       ├── runtime/
│   │       │   ├── checkClaude.ts
│   │       │   ├── ClaudeCliRunner.ts
│   │       │   ├── SystemPromptBuilder.ts
│   │       │   ├── AgentRuntime.ts
│   │       │   └── index.ts
│   │       ├── messaging/
│   │       │   ├── MessageBus.ts
│   │       │   └── index.ts
│   │       ├── approval/
│   │       │   ├── ApprovalGate.ts
│   │       │   └── index.ts
│   │       ├── orchestrator/
│   │       │   ├── Orchestrator.ts
│   │       │   ├── TaskQueue.ts
│   │       │   └── index.ts
│   │       ├── __tests__/
│   │       │   ├── memory/
│   │       │   │   ├── FileAdapter.test.ts
│   │       │   │   └── MemoryManager.test.ts
│   │       │   ├── registry/
│   │       │   │   └── TeamRegistry.test.ts
│   │       │   ├── runtime/
│   │       │   │   ├── checkClaude.test.ts
│   │       │   │   ├── ClaudeCliRunner.test.ts
│   │       │   │   ├── SystemPromptBuilder.test.ts
│   │       │   │   └── AgentRuntime.test.ts
│   │       │   ├── messaging/
│   │       │   │   └── MessageBus.test.ts
│   │       │   ├── approval/
│   │       │   │   └── ApprovalGate.test.ts
│   │       │   └── orchestrator/
│   │       │       ├── Orchestrator.test.ts
│   │       │       └── TaskQueue.test.ts
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
