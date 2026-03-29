# vscode-ext — Development Progress

## Last Updated
2026-03-29T20:00:00Z

## Current Phase
Phase 7 — Templates, Polish & End-to-End Testing | Sub-phase 7.1 — Agent Template Library (COMPLETE)

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

## Current Branch
main (phase/7.1-templates merged and deleted)

## What Was Just Built

`packages/core/src/templates/` — full agent template library with 8 built-in templates (frontend, backend, qa, security, devops, documentation, database, reviewer) and 4 team presets (fullstack-web, api-service, open-source, solo). `TemplateLibrary` class provides `instantiateFromTemplate` and `instantiateFromPreset`. `AgentExporter` handles gzip-compressed .agentpack export/import with sessionId stripping and memory summarisation. `AgentFileDecorationProvider` in the extension layer shows which files agents are editing. Extension commands `addAgent`, `exportAgent`, `importAgent` now fully implemented with QuickPick/save dialogs. 47 new tests added (269 total across all packages).

## Decisions Made This Session
- `.agentpack` uses gzip-compressed JSON (no external ZIP library needed — uses Node.js built-in `zlib`)
- `generateAgentId` uses the random hex tail of `generateId()` output to ensure uniqueness even in rapid successive calls
- `AgentFileDecorationProvider` registered via `vscode.window.registerFileDecorationProvider` in `extension.ts`; `clearAll()` called on `deactivate()`
- Phase 7 spec files (PHASE-7.md and PHASE-7.1.md) diverge in naming — CLAUDE.md canonical names used throughout (`claudeMdTemplate`, `TeamPreset.agents`, `AgentModel`, `maxTurns`)

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh)
- 10 pre-existing lint warnings in test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-7.md` sub-phases 7.3–7.5 (UX Polish, E2E Tests, Release Prep).
3. Create branch: `git checkout main && git checkout -b phase/7.3-ux-polish`
4. Sub-phase 7.3 — audit and fix UX flows (empty states, error states, loading states, keyboard shortcuts).
5. Sub-phase 7.4 — additional end-to-end workflow tests for chat delegation and git workflows.
6. Sub-phase 7.5 — README, CONTRIBUTING, CHANGELOG, package as `.vsix`, GitHub v0.1.0 release.
7. Run `npm run typecheck && npm run lint && npm run test` — all must pass before pushing.

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
│   │       │   ├── AgentTemplates.ts   ← NEW: 8 templates, 4 presets
│   │       │   ├── TemplateLibrary.ts  ← NEW
│   │       │   ├── AgentExporter.ts    ← NEW: .agentpack export/import
│   │       │   └── index.ts
│   │       └── __tests__/
│   │           ├── templates/
│   │           │   ├── TemplateLibrary.test.ts  ← NEW
│   │           │   └── AgentExporter.test.ts    ← NEW
│   │           └── integration/
│   │               └── e2e.test.ts              ← NEW
│   └── extension/
│       └── src/
│           ├── extension.ts             ← updated: registers AgentFileDecorationProvider
│           ├── ProjectNameSession.ts
│           ├── commands/index.ts        ← updated: addAgent, exportAgent, importAgent implemented
│           ├── providers/
│           │   └── AgentFileDecorationProvider.ts  ← NEW
│           ├── panels/ (AgentPanel, ApprovalQueuePanel)
│           ├── statusbar/ (AgentStatusBar)
│           └── __tests__/ (AgentPanel, ApprovalQueuePanel tests)
```
