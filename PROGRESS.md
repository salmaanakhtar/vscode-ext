# vscode-ext — Development Progress

## Last Updated
2026-03-28T10:12:00Z

## Current Phase
Phase 3 — Orchestration & Approval | Sub-phase 3.2 — MessageBus & ApprovalGate (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)
- [x] 3.2 — MessageBus & ApprovalGate

## Current Branch
main (phase/3.2-messagebus-approvalgate merged and deleted)

## What Was Just Built
`MessageBus` in `packages/core/src/messaging/` and `ApprovalGate` in `packages/core/src/approval/`. MessageBus provides file-based agent-to-agent messaging via `.agent/inbox/*.md` files, watched via chokidar with `send`, `broadcast`, `readInbox`, `clearInbox`, and `onMessage` APIs. ApprovalGate classifies agent actions by risk level using `RISK_LEVEL_MAP`, routes non-auto actions through a pluggable `ApprovalHandler`, and writes an immutable audit trail to `.agent/memory/audit.md`. 18 new unit tests; 139 total (all passing).

## Decisions Made This Session
- Used canonical directory names `messaging/` and `approval/` (per CLAUDE.md) rather than `bus/` and `gate/` named in the phase spec file.
- `getRiskLevel` takes an `_agentId` param (prefixed unused) to allow per-agent overrides in a future phase without breaking the signature.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` in extension.ts stub produces ESLint warnings — expected, intentional for stub.
- chokidar file-change handler is not tested directly (requires live FS events); covered by integration tests in a later phase.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-4.1.md` (Orchestrator).
3. Create branch: `git checkout main && git checkout -b phase/4.1-orchestrator`
4. Implement `Orchestrator` in `packages/core/src/orchestrator/`.
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
│   │       │   └── approval/
│   │       │       └── ApprovalGate.test.ts
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
