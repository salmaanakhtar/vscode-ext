# vscode-ext — Development Progress

## Last Updated
2026-03-29T20:30:00Z

## Current Phase
Phase 7 — Templates, Polish & End-to-End Testing | Sub-phase 7.3 — UX Polish (COMPLETE)

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
- [x] 7.1 — Agent Template Library, Export/Import, File Decorations, E2E Tests
- [x] 7.3 — UX Polish, Error Handling, Empty States, Keyboard Shortcuts

## Current Branch
main (phase/7.3-ux-polish merged and deleted)

## What Was Just Built

UX polish pass across the entire extension layer. `AgentPanel` now shows an empty-state CTA when no team is running and persists chat history across panel close/reopen using `workspaceState`. `ApprovalQueuePanel` dynamically updates its panel title with the pending count (e.g. "vscode-ext Approvals (3)"), validates that reject requires non-empty feedback, and fades resolved cards before removal. `AgentStatusBar` now shows formatted cost (`$0.03`) and a breakdown tooltip. `AgentFileDecorationProvider` updated with state-based colours (blue=active, yellow=awaiting approval) and improved tooltip. `extension.ts` checks for claude CLI at startup and shows an actionable error with instructions if not found. Keyboard shortcuts added (`Ctrl+Shift+A` for Agent Panel, `Ctrl+Shift+Q` for Approval Queue).

## Decisions Made This Session
- Chat history stored in `workspaceState` (workspace-scoped, not globalState) — project chat history belongs to the workspace
- `pushState()` now posts `noTeam` message when no session (previously a silent no-op) — allows webview to show the empty state
- Claude CLI check happens in `autoStart` before attempting registry load — fails fast with actionable message
- `reject` requires non-empty feedback (validated in webview JS, not TypeScript) — keeps TypeScript clean

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh)
- 10 pre-existing lint warnings in test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors
- File decoration `setActiveFile` is not yet wired to task lifecycle — requires watching agent output files (deferred to v2)

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-7.md` sub-phases 7.4–7.5 (E2E Tests, Release Prep).
3. Create branch: `git checkout main && git checkout -b phase/7.4-e2e-tests`
4. Sub-phase 7.4 — comprehensive end-to-end integration tests (workflow-init, workflow-chat, workflow-approval, workflow-git, workflow-export).
5. Sub-phase 7.5 — README, CONTRIBUTING, CHANGELOG, package as `.vsix`, GitHub v0.1.0 release.
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
│   │   └── src/
│   │       ├── types/index.ts
│   │       ├── interfaces/MemoryAdapter.ts
│   │       ├── constants/index.ts
│   │       ├── utils/ (paths, id, logger, validation)
│   │       └── __tests__/ (3 test files)
│   ├── core/
│   │   └── src/
│   │       ├── memory/ (FileAdapter, SQLiteAdapter, MemoryManager)
│   │       ├── registry/ (TeamRegistry)
│   │       ├── runtime/ (AgentRuntime, ClaudeCliRunner, SystemPromptBuilder, checkClaude)
│   │       ├── messaging/ (MessageBus)
│   │       ├── approval/ (ApprovalGate)
│   │       ├── orchestrator/ (Orchestrator, TaskQueue)
│   │       ├── git/ (GitManager)
│   │       ├── templates/
│   │       │   ├── AgentTemplates.ts
│   │       │   ├── TemplateLibrary.ts
│   │       │   ├── AgentExporter.ts
│   │       │   └── index.ts
│   │       └── __tests__/
│   │           ├── templates/ (TemplateLibrary.test.ts, AgentExporter.test.ts)
│   │           └── integration/e2e.test.ts
│   └── extension/
│       └── src/
│           ├── extension.ts              ← updated: claude CLI check, graceful startup errors
│           ├── ProjectNameSession.ts
│           ├── commands/index.ts
│           ├── providers/
│           │   └── AgentFileDecorationProvider.ts  ← updated: state colors, agent name tooltip
│           ├── panels/
│           │   ├── AgentPanel.ts         ← updated: empty state, chat history, noTeam message
│           │   └── ApprovalQueuePanel.ts ← updated: dynamic title, reject validation, fade-out
│           ├── statusbar/
│           │   └── AgentStatusBar.ts     ← updated: cost formatting, tooltip breakdown
│           └── __tests__/ (AgentPanel.test.ts, ApprovalQueuePanel.test.ts)
```
