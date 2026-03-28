# vscode-ext — Development Progress

## Last Updated
2026-03-28T19:55:00Z

## Current Phase
Phase 4 — Git Integration | Sub-phase 4.1 — Orchestrator (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)
- [x] 3.2 — MessageBus & ApprovalGate
- [x] 4.1 — Orchestrator & TaskQueue

## Current Branch
main (phase/4.1-orchestrator merged and deleted)

## What Was Just Built
`Orchestrator` in `packages/core/src/orchestrator/` and `TaskQueue` as a supporting class. `Orchestrator.handleUserMessage` runs the Team Lead, parses `DELEGATE:[agent-id]:[task]` lines from its output, executes delegations in parallel via `AgentRuntime`, then synthesises results back through the Team Lead. `runDirectTask` bypasses the Team Lead and sends a non-blocking notification to it afterwards. `TaskQueue` tracks task lifecycle (pending → running → complete/failed) with age-based clearing. 24 new unit tests; 163 total (all passing).

## Decisions Made This Session
- Spec imported `MessageBus` from `'../bus/MessageBus'` — used canonical `messaging/` directory per CLAUDE.md.
- Spec included an unused `runtime` variable in one delegation test — removed to satisfy ESLint `no-unused-vars`.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- chokidar file-change handler not tested directly (requires live FS events); covered by integration tests in a later phase.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-4.2.md` (Git Integration).
3. Create branch: `git checkout main && git checkout -b phase/4.2-git-integration`
4. Implement Git integration in `packages/core/src/git/`.
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
