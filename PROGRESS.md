# vscode-ext — Development Progress

## Last Updated
2026-03-29T19:35:00Z

## Current Phase
Phase 6 — Approval Queue UI | Sub-phase 6.1 — Approval Queue UI (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)
- [x] 3.2 — MessageBus & ApprovalGate
- [x] 4.1 — Orchestrator & TaskQueue
- [x] 4.2 — Git Integration (GitManager)
- [x] 5.1 — VS Code Extension Shell
- [x] 5.2 — Agent Panel UI
- [x] 6.1 — Approval Queue UI

## Current Branch
main (phase/6.1-approval-queue-ui merged and deleted)

## What Was Just Built
`ApprovalQueuePanel` webview in `packages/extension/src/panels/ApprovalQueuePanel.ts` — polls `ApprovalGate.getPendingRequests()` every 1 second, renders pending approval cards with Approve/Reject buttons and optional feedback, stores resolutions in `workspaceState` for the polling handler in `ProjectNameSession` to pick up. Badge on panel tab shows pending count. Wired into `extension.ts` alongside `AgentPanel`. The `projectname.openApprovalQueue` stub removed from `commands/index.ts` and registered properly in `extension.ts`. 18 new unit tests added (39 total for extension package, 218 total across all packages).

## Decisions Made This Session
- `WebviewPanel.badge` exists at runtime (VS Code 1.79+) but is absent from the installed `@types/vscode@1.85` — accessed via `unknown` cast with comment.
- `ApprovalRequest` import removed from panel (only `ApprovalResolution` is needed; request type is cast inline).
- `projectname.openApprovalQueue` moved from `commands/index.ts` stub to `extension.ts` proper registration (same pattern as `agentTeam.focus`).

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh); covered in later integration phase.
- 10 pre-existing lint warnings in test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-7.1.md` (Templates, Agent Export/Import & Polish).
3. Create branch: `git checkout main && git checkout -b phase/7.1-templates`
4. Implement agent template library in `packages/core/src/templates/`.
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
│   │       ├── git/
│   │       │   ├── GitManager.ts
│   │       │   └── index.ts
│   │       └── __tests__/
│   │           ├── memory/
│   │           ├── registry/
│   │           ├── runtime/
│   │           ├── messaging/
│   │           ├── approval/
│   │           ├── orchestrator/
│   │           └── git/
│   └── extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── resources/icon.svg
│       └── src/
│           ├── extension.ts
│           ├── ProjectNameSession.ts
│           ├── __mocks__/
│           │   └── vscode.ts
│           ├── commands/
│           │   └── index.ts
│           ├── statusbar/
│           │   └── AgentStatusBar.ts
│           ├── panels/
│           │   ├── AgentPanel.ts
│           │   └── ApprovalQueuePanel.ts
│           ├── providers/.gitkeep
│           └── __tests__/
│               └── panels/
│                   ├── AgentPanel.test.ts
│                   └── ApprovalQueuePanel.test.ts
```
