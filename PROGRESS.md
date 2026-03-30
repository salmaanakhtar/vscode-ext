# vscode-ext — Development Progress

## Last Updated
2026-03-30T08:20:00Z

## Current Phase
Phase 7 — Templates, Polish & End-to-End Testing | Sub-phase 7.4 — E2E Tests (COMPLETE)

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
- [x] 7.4 — E2E Integration Test Suite (5 workflow files, 82 new tests)

## Current Branch
main (phase/7.4-e2e-tests merged and deleted)

## What Was Just Built

Comprehensive e2e integration test suite in `packages/core/src/__tests__/e2e/`. Five workflow test files exercise the full agent lifecycle against real temp filesystems (no mocked CLIs, no network): `workflow-init` covers project init, agent registration, and preset wiring; `workflow-chat` covers Team Lead delegation, @mention direct tasks, and task queue tracking via Orchestrator stub; `workflow-approval` covers approval gate flow, risk level classification, audit log writes, and sequential requests; `workflow-git` covers branch naming convention, commit message tagging, push/PR/merge permission enforcement using a real git repo; `workflow-export` covers `.agentpack` round-trip export/import including sessionId stripping, ID override, and memory summary inclusion. Total: 289 tests passing (82 new), 20 test files, zero lint errors. `AgentPanel` now shows an empty-state CTA when no team is running and persists chat history across panel close/reopen using `workspaceState`. `ApprovalQueuePanel` dynamically updates its panel title with the pending count (e.g. "vscode-ext Approvals (3)"), validates that reject requires non-empty feedback, and fades resolved cards before removal. `AgentStatusBar` now shows formatted cost (`$0.03`) and a breakdown tooltip. `AgentFileDecorationProvider` updated with state-based colours (blue=active, yellow=awaiting approval) and improved tooltip. `extension.ts` checks for claude CLI at startup and shows an actionable error with instructions if not found. Keyboard shortcuts added (`Ctrl+Shift+A` for Agent Panel, `Ctrl+Shift+Q` for Approval Queue).

## Decisions Made This Session
- E2E tests live in `packages/core/src/__tests__/e2e/` (separate from `integration/`) to distinguish workflow-level tests from the pre-existing module-integration tests
- `workflow-git` uses a real git repo (matching the existing `GitManager.test.ts` pattern) rather than mocked `simpleGit` — avoids complex mock wiring with no added coverage value
- `workflow-chat` uses stub registry/runtime (same approach as `Orchestrator.test.ts`) since the real CLI subprocess is already covered by `AgentRuntime.test.ts`
- `onTaskComplete` receives the original `queuedTask` reference (which retains `status: 'pending'`) because `TaskQueue.update()` creates a new object — test asserts on `agentId` + result string, not status

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh)
- 10 pre-existing lint warnings in test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors
- File decoration `setActiveFile` is not yet wired to task lifecycle — requires watching agent output files (deferred to v2)

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-7.md` sub-phase 7.5 (Documentation & Release Prep).
3. Create branch: `git checkout main && git checkout -b phase/7.5-release-prep`
4. Write README.md (comprehensive: features, quick start, templates, approval system, git integration, memory, config, keyboard shortcuts, FAQ)
5. Write CONTRIBUTING.md (dev setup, test/typecheck/lint commands, branch strategy)
6. Write CHANGELOG.md (v0.1.0 entry)
7. Ensure `packages/extension/package.json` has all required marketplace fields (publisher, displayName, description, categories, keywords, icon, repository, license)
8. Package as `.vsix`: `cd packages/extension && vsce package --out ../../dist/vscode-ext-0.1.0.vsix`
9. Tag v0.1.0 and create GitHub release with `.vsix` attached
10. Update PROGRESS.md to mark project complete

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
