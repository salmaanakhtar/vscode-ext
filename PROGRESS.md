# vscode-ext — Development Progress

## Last Updated
2026-03-27T21:15:00Z

## Current Phase
Phase 3 — Orchestration & Approval | Sub-phase 3.1 — Agent Runtime (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)

## Current Branch
main (phase/3.1-agent-runtime merged and deleted)

## What Was Just Built
`AgentRuntime` in `packages/core/src/runtime/`. Wraps the local `claude` CLI via `child_process.spawn` (no API key, no SDK — runs on user's Pro/Max subscription). Four modules: `checkClaude.ts` (prerequisite check), `ClaudeCliRunner.ts` (low-level subprocess wrapper with streaming EventEmitter), `SystemPromptBuilder.ts` (assembles system prompt from registry files + memory), `AgentRuntime.ts` (orchestrates task execution, session caching, status tracking, abort support). 36 new unit tests, all passing (121 total).

## Decisions Made This Session
- Spec's `getTeamLeadAsAgent()` used stale `maxBudgetUsd` field — corrected to `maxTurns` matching actual `Agent` type.
- Spec's ENOENT test emitted `close` before `error` (race condition) — fixed with a dedicated `makeErrorProc` helper that fires `error` first then `close`, matching real Node.js behaviour.
- Added `getProjectRoot()` to `TeamRegistry` (referenced by `AgentRuntime` but missing from the spec's registry implementation).

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- `packages/core/tsconfig.json` has no `rootDir` — acceptable for now.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-3.2.md` (MessageBus & ApprovalGate).
3. Create branch: `git checkout main && git checkout -b phase/3.2-message-bus`
4. Implement `MessageBus` in `packages/core/src/messaging/` and `ApprovalGate` in `packages/core/src/approval/`.
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
│   │       ├── __tests__/
│   │       │   ├── memory/
│   │       │   │   ├── FileAdapter.test.ts
│   │       │   │   └── MemoryManager.test.ts
│   │       │   ├── registry/
│   │       │   │   └── TeamRegistry.test.ts
│   │       │   └── runtime/
│   │       │       ├── checkClaude.test.ts
│   │       │       ├── ClaudeCliRunner.test.ts
│   │       │       ├── SystemPromptBuilder.test.ts
│   │       │       └── AgentRuntime.test.ts
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
